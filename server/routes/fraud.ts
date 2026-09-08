import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { DEMO_ORG_ID, getStore } from "../db.js";
import { generateInvestigationBrief } from "../lib/claude.js";
import { publishDashboardEvent } from "../lib/eventBus.js";
import { scoreTransaction } from "../lib/mlClient.js";
import type { RiskLevel, TransactionStatus } from "../types.js";

export const fraudRouter = Router();

// Threshold contract for the ingress pipeline (see CLAUDE.md Critical Rule:
// nothing above is an *autonomous adverse* action against a customer — it is
// a transaction-level triage decision. Anything in the grey zone is frozen
// and handed to a human analyst, never resolved automatically.
const AUTO_BLOCK_THRESHOLD = 0.85;
const AUTO_APPROVE_THRESHOLD = 0.35;
const HIGH_RISK_THRESHOLD = 0.6;

interface EvaluateRequestBody {
  transactionId?: string;
  orgId?: string;
  amountPkr: number;
  senderId: string;
  recipientId: string;
  deviceFingerprint?: string | null;
  velocityLast24h: number;
  accountAgeDays: number;
  deviceRiskScore: number;
}

function validateBody(body: unknown): EvaluateRequestBody | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  if (
    typeof b.amountPkr !== "number" ||
    b.amountPkr <= 0 ||
    typeof b.senderId !== "string" ||
    typeof b.recipientId !== "string" ||
    typeof b.velocityLast24h !== "number" ||
    b.velocityLast24h < 0 ||
    typeof b.accountAgeDays !== "number" ||
    b.accountAgeDays < 0 ||
    typeof b.deviceRiskScore !== "number" ||
    b.deviceRiskScore < 0 ||
    b.deviceRiskScore > 1
  ) {
    return null;
  }

  return {
    transactionId: typeof b.transactionId === "string" ? b.transactionId : undefined,
    orgId: typeof b.orgId === "string" ? b.orgId : undefined,
    amountPkr: b.amountPkr,
    senderId: b.senderId,
    recipientId: b.recipientId,
    deviceFingerprint: typeof b.deviceFingerprint === "string" ? b.deviceFingerprint : null,
    velocityLast24h: b.velocityLast24h,
    accountAgeDays: b.accountAgeDays,
    deviceRiskScore: b.deviceRiskScore,
  };
}

export function statusForScore(fraudProbability: number): TransactionStatus {
  if (fraudProbability >= AUTO_BLOCK_THRESHOLD) return "BLOCKED";
  if (fraudProbability <= AUTO_APPROVE_THRESHOLD) return "APPROVED";
  return "PENDING_REVIEW";
}

export function riskLevelForScore(fraudProbability: number): RiskLevel {
  return fraudProbability >= HIGH_RISK_THRESHOLD ? "HIGH" : "MEDIUM";
}

/**
 * POST /api/v1/fraud/evaluate — the fraud detection ingress pipeline.
 *
 * Forwards transaction risk features to the ML engine (with an automatic
 * fallback to a structural heuristic if that link is down), triages the
 * result into APPROVED / BLOCKED / PENDING_REVIEW, and — for the grey zone
 * only — freezes the transaction, writes an alert, asks Claude for a plain
 * English investigation brief, and publishes a real-time dashboard event.
 */
fraudRouter.post("/evaluate", async (req: Request, res: Response) => {
  const input = validateBody(req.body);
  if (!input) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const store = getStore();
  const transactionId = input.transactionId ?? `txn_${randomUUID()}`;
  const orgId = input.orgId ?? DEMO_ORG_ID;

  const scoreResult = await scoreTransaction({
    transactionId,
    amountPkr: input.amountPkr,
    velocity_last_24h: input.velocityLast24h,
    account_age_days: input.accountAgeDays,
    device_risk_score: input.deviceRiskScore,
  });

  const status = statusForScore(scoreResult.fraudProbability);

  const transaction = await store.createTransaction({
    id: transactionId,
    orgId,
    amountPkr: input.amountPkr,
    senderId: input.senderId,
    recipientId: input.recipientId,
    deviceFingerprint: input.deviceFingerprint ?? null,
    status,
    mlScore: scoreResult.fraudProbability,
    mlFeatures: {
      velocity_last_24h: input.velocityLast24h,
      account_age_days: input.accountAgeDays,
      device_risk_score: input.deviceRiskScore,
    },
  });

  if (status !== "PENDING_REVIEW") {
    res.status(201).json({ transaction, alert: null, scoreSource: scoreResult.source });
    return;
  }

  let hermesBrief: string | null = null;
  try {
    hermesBrief = await generateInvestigationBrief({
      transactionId,
      amountPkr: input.amountPkr,
      fraudProbability: scoreResult.fraudProbability,
      features: scoreResult.features,
      scoreSource: scoreResult.source,
    });
  } catch (error) {
    console.error("[fraud/evaluate] Hermes brief generation failed:", error);
  }

  const alert = await store.createAlert({
    orgId,
    transactionId,
    alertType: "ML_FLAGGED_SUSPICIOUS",
    riskLevel: riskLevelForScore(scoreResult.fraudProbability),
    hermesBrief,
  });

  publishDashboardEvent({ type: "alert.created", alert });

  res.status(201).json({ transaction, alert, scoreSource: scoreResult.source });
});
