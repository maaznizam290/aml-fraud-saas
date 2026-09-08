import { Router, type Request, type Response } from "express";
import { DEMO_ORG_ID, getStore } from "../db.js";
import { synthesizeHermesRules } from "../lib/claude.js";
import { publishDashboardEvent } from "../lib/eventBus.js";
import { HISTORICAL_SEED_CASES } from "../lib/historicalSeed.js";
import { backtestRule } from "../lib/ruleEngine.js";

export const hermesRouter = Router();

const RESOLVED_ALERTS_LOOKBACK = 50;

/**
 * POST /api/v1/hermes/synthesize — the Hermes Autonomous Governance Layer.
 *
 * Reads recently confirmed analyst decisions, asks Claude to propose new
 * heuristic rules for where the ML engine's score disagreed with the human
 * call, backtests each proposal against the historical seed set for a
 * confusion matrix, and persists every proposal with status PENDING.
 *
 * Guardrail: this endpoint can only ever CREATE rules in the PENDING state.
 * It has no code path that sets a rule to DEPLOYED — see
 * POST /api/v1/hermes/rules/:id/promote for the only way a rule goes live,
 * which is gated on the chief_compliance_officer role.
 */
hermesRouter.post("/synthesize", async (req: Request, res: Response) => {
  const orgId = typeof req.body?.orgId === "string" ? req.body.orgId : DEMO_ORG_ID;
  const store = getStore();

  const resolvedAlerts = await store.listRecentResolvedAlerts(orgId, RESOLVED_ALERTS_LOOKBACK);
  if (resolvedAlerts.length === 0) {
    res.json({
      rules: [],
      message: "No resolved alerts yet — Hermes needs confirmed analyst decisions to learn from.",
    });
    return;
  }

  let proposals;
  try {
    proposals = await synthesizeHermesRules(resolvedAlerts);
  } catch (error) {
    console.error("[hermes/synthesize] Claude synthesis failed:", error);
    res.status(502).json({ error: "Hermes rule synthesis failed", detail: (error as Error).message });
    return;
  }

  const createdRules = [];
  for (const proposal of proposals) {
    const confusionMatrix = backtestRule(proposal.conditions, HISTORICAL_SEED_CASES);
    const rule = await store.createHermesRule({
      orgId,
      ruleName: proposal.rule_name,
      conditions: proposal.conditions,
      accuracyRating: confusionMatrix.accuracy,
    });
    publishDashboardEvent({ type: "hermes_rule.created", rule });
    createdRules.push({ rule, rationale: proposal.rationale, confusionMatrix });
  }

  res.status(201).json({ rules: createdRules });
});

/** GET /api/v1/hermes/rules — the governance rule deck for the dashboard. */
hermesRouter.get("/rules", async (req: Request, res: Response) => {
  const orgId = typeof req.query.orgId === "string" ? req.query.orgId : DEMO_ORG_ID;
  const rules = await getStore().listHermesRules(orgId);
  res.json({ rules });
});

/**
 * POST /api/v1/hermes/rules/:id/promote — the ONLY path from PENDING to
 * DEPLOYED. Requires the x-user-id header to resolve to a profile with role
 * 'chief_compliance_officer'. This is a hard statutory guardrail, not a
 * configurable option: per this project's Critical Rule, no AI-proposed
 * rule may ever become active policy without an explicit compliance-officer
 * authorization, and this endpoint never touches account status, SAR/STR
 * filing, or fund movement/release — it only flips a heuristic rule's flag.
 */
hermesRouter.post("/rules/:id/promote", async (req: Request, res: Response) => {
  const userId = req.header("x-user-id");
  if (!userId) {
    res.status(401).json({ error: "x-user-id header is required" });
    return;
  }

  const store = getStore();
  const profile = await store.getProfile(userId);
  if (!profile || profile.role !== "chief_compliance_officer") {
    res.status(403).json({
      error: "Only a chief_compliance_officer may promote a Hermes rule to DEPLOYED",
    });
    return;
  }

  const rule = await store.updateHermesRuleStatus(req.params.id, "DEPLOYED");
  if (!rule) {
    res.status(404).json({ error: `Hermes rule ${req.params.id} not found` });
    return;
  }

  publishDashboardEvent({ type: "hermes_rule.promoted", rule });
  res.json({ rule });
});
