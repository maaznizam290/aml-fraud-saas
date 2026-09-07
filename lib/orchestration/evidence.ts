/**
 * Evidence collection: gathers everything the Claude investigation prompt
 * needs, from every provider this branch owns (transaction history,
 * customer/KYC, sanctions, device, location, country risk, deterministic
 * risk signals, ML prediction).
 *
 * Each category is collected independently and wrapped so one provider
 * failing (e.g. the ML service being down) does not abort the others —
 * partial evidence with a recorded error is always preferable to no
 * evidence, and is never silently upgraded into a fabricated value. See
 * docs/ORCHESTRATION.md "Safe failure".
 */
import { randomUUID } from "node:crypto";

import type { Alert } from "../supabase/types.js";
import { requestMlPrediction } from "./mlClient.js";
import type { OrchestrationStore } from "./store.js";
import type {
  CountryRiskEvidenceData,
  CustomerProfileEvidenceData,
  DeviceEvidenceData,
  EvidenceBundle,
  EvidenceCollectionError,
  EvidenceItem,
  KycEvidenceData,
  LocationEvidenceData,
  SanctionsEvidenceData,
  TransactionHistoryEvidenceData,
} from "./types.js";

const DEFAULT_HIGH_RISK_COUNTRIES = new Set(["KY", "NG"]);
const HISTORY_LIMIT = 50;

export interface EvidenceCollectorOptions {
  mlServiceUrl: string;
  mlTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export async function collectEvidence(
  store: OrchestrationStore,
  alert: Alert,
  options: EvidenceCollectorOptions
): Promise<EvidenceBundle> {
  const items: EvidenceItem[] = [];
  const errors: EvidenceCollectionError[] = [];
  const now = new Date().toISOString();

  const customer = await safe(errors, "CUSTOMER_PROFILE", () => store.getCustomer(alert.customer_id));
  const profile = await safe(errors, "CUSTOMER_PROFILE", () => store.getCustomerProfile(alert.customer_id));
  const transaction = alert.transaction_id
    ? await safe(errors, "TRANSACTION_HISTORY", () => store.getTransaction(alert.transaction_id as string))
    : null;
  const history = customer
    ? await safe(errors, "TRANSACTION_HISTORY", () =>
        store.getRecentTransactions(customer.id, transaction?.transaction_at ?? now, HISTORY_LIMIT)
      )
    : null;

  if (transaction !== undefined && transaction !== null) {
    items.push(
      evidenceItem<TransactionHistoryEvidenceData>(
        "TRANSACTION_HISTORY",
        `Transaction of $${transaction.amount} (${transaction.direction}) via ${transaction.channel}, plus ${
          history?.length ?? 0
        } prior transaction(s).`,
        { transaction, recentTransactions: history ?? [] },
        "supabase.transactions"
      )
    );
  } else if (history) {
    items.push(
      evidenceItem<TransactionHistoryEvidenceData>(
        "TRANSACTION_HISTORY",
        `${history.length} prior transaction(s) on file (alert has no single primary transaction).`,
        { transaction: null, recentTransactions: history },
        "supabase.transactions"
      )
    );
  }

  if (customer) {
    items.push(
      evidenceItem<CustomerProfileEvidenceData>(
        "CUSTOMER_PROFILE",
        `Customer risk rating ${customer.risk_rating}, account opened ${customer.account_opened_at}.`,
        { customerProfile: profile ?? null, riskRating: customer.risk_rating },
        "supabase.customers"
      )
    );
    items.push(
      evidenceItem<KycEvidenceData>(
        "KYC_STATUS",
        `KYC status: ${customer.kyc_status}.`,
        { kycStatus: customer.kyc_status },
        "supabase.customers"
      )
    );
  } else {
    errors.push({ category: "CUSTOMER_PROFILE", message: `Customer ${alert.customer_id} not found` });
  }

  const sanctionsStatus = profile?.sanctions_status ?? "PENDING_REVIEW";
  items.push(
    evidenceItem<SanctionsEvidenceData>(
      "SANCTIONS_RESULT",
      `Sanctions screening status: ${sanctionsStatus}.`,
      { sanctionsStatus, sanctionsCheckedAt: profile?.sanctions_checked_at ?? null },
      "supabase.customer_profiles"
    )
  );

  if (transaction) {
    items.push(
      evidenceItem<DeviceEvidenceData>(
        "DEVICE_INFO",
        transaction.device_is_new
          ? "Transaction initiated from a new/unrecognized device."
          : `Device ${transaction.device_id ?? "unknown"} used.`,
        { deviceId: transaction.device_id, deviceIsNew: transaction.device_is_new },
        "supabase.transactions"
      )
    );

    const countries = [transaction.origin_country, transaction.destination_country, transaction.counterparty_country]
      .filter((c): c is string => Boolean(c));
    items.push(
      evidenceItem<LocationEvidenceData>(
        "LOCATION_INFO",
        `Origin ${transaction.origin_country ?? "unknown"} -> destination ${transaction.destination_country ?? "unknown"}.`,
        {
          originCountry: transaction.origin_country,
          destinationCountry: transaction.destination_country,
          counterpartyCountry: transaction.counterparty_country,
        },
        "supabase.transactions"
      )
    );

    const matched = countries.filter((c) => DEFAULT_HIGH_RISK_COUNTRIES.has(c));
    items.push(
      evidenceItem<CountryRiskEvidenceData>(
        "COUNTRY_RISK",
        matched.length > 0
          ? `Elevated-risk jurisdiction(s) involved: ${matched.join(", ")}.`
          : "No elevated-risk jurisdictions involved.",
        { countriesInvolved: countries, highRiskCountriesMatched: matched },
        "orchestration.country_risk_policy"
      )
    );
  }

  // ML prediction (deterministic risk signals + ML score) — safe failure:
  // requestMlPrediction never throws, it returns a degraded result.
  if (transaction && customer) {
    const mlResult = await requestMlPrediction(transaction, customer, profile, history ?? [], {
      baseUrl: options.mlServiceUrl,
      timeoutMs: options.mlTimeoutMs,
      fetchImpl: options.fetchImpl,
    });

    if (mlResult.degraded) {
      errors.push({ category: "ML_PREDICTION", message: mlResult.error ?? "ML prediction unavailable" });
    }

    if (mlResult.riskSignals.length > 0) {
      items.push(
        evidenceItem(
          "RISK_SIGNALS",
          `${mlResult.riskSignals.filter((s) => s.triggered).length} of ${mlResult.riskSignals.length} deterministic risk signals triggered.`,
          mlResult.riskSignals,
          "fraud-ml.risk_engine"
        )
      );
    }

    items.push(
      evidenceItem(
        "ML_PREDICTION",
        mlResult.degraded
          ? "ML prediction unavailable — proceeding on deterministic evidence only."
          : `ML model ${mlResult.provider}/${mlResult.modelName}@${mlResult.modelVersion} score: ${mlResult.score.toFixed(2)}.`,
        mlResult,
        "fraud-ml.api"
      )
    );
  } else {
    errors.push({
      category: "ML_PREDICTION",
      message: "No transaction/customer available — ML prediction skipped, not fabricated.",
    });
  }

  return {
    alertId: alert.id,
    organizationId: alert.organization_id,
    customerId: alert.customer_id,
    transactionId: alert.transaction_id,
    items,
    errors,
    collectedAt: now,
  };
}

function evidenceItem<T>(
  category: EvidenceItem["category"],
  summary: string,
  data: T,
  source: string
): EvidenceItem<T> {
  return { id: randomUUID(), category, summary, data, source, retrievedAt: new Date().toISOString() };
}

async function safe<T>(
  errors: EvidenceCollectionError[],
  category: EvidenceCollectionError["category"],
  fn: () => Promise<T>
): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    errors.push({ category, message: err instanceof Error ? err.message : String(err) });
    return null;
  }
}
