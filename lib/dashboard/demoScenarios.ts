/**
 * The five investor-demo scenarios (task section 3 "Demo Simulator").
 * Each builder returns a fresh, realistic-but-synthetic customer +
 * transaction history + alert, seeded into the DEMO in-memory store and
 * then run through the *real* `runInvestigation` pipeline
 * (lib/orchestration/investigationService.ts) — nothing about evidence
 * collection, risk scoring, or the AI investigation is reimplemented or
 * faked here, only the input data is synthetic.
 *
 * DEMO mode has no live fraud-ml service to call (see
 * docs/ORCHESTRATION.md "Known limitations": mlClient.ts was never
 * exercised against a running instance), so `DemoLLMProvider`'s
 * disposition mostly follows sanctions-screening status, which these
 * scenarios set deliberately per the narrative each is meant to tell —
 * this is exactly the "controlled simulation" task section 4 allows for
 * demo mode, not fabricated evidence.
 */
import { randomUUID } from "node:crypto";

import type { Alert, Customer, CustomerProfile, Transaction } from "../supabase/types.js";
import { DEMO_ORGANIZATION_ID } from "../shared/constants.js";

export interface DemoScenarioSeed {
  customer: Customer;
  profile: CustomerProfile;
  transactions: Transaction[];
  alert: Alert;
}

export type DemoScenarioId =
  | "high_velocity"
  | "new_device_large_transfer"
  | "multi_country_anomaly"
  | "structuring"
  | "false_positive";

export interface DemoScenarioMeta {
  id: DemoScenarioId;
  title: string;
  description: string;
  expectedNarrative: string;
}

export const DEMO_SCENARIOS: DemoScenarioMeta[] = [
  {
    id: "high_velocity",
    title: "High-velocity transfers",
    description: "Eight outbound transfers from one account within two hours — a classic layering pattern.",
    expectedNarrative: "Confirmed sanctions hit compounds the velocity anomaly — AI recommends escalation.",
  },
  {
    id: "new_device_large_transfer",
    title: "New device + large transfer",
    description: "A first-time device initiates an outsized transfer far above the customer's typical amount.",
    expectedNarrative: "Potential sanctions match plus device risk — AI refers for analyst judgment.",
  },
  {
    id: "multi_country_anomaly",
    title: "Multi-country anomaly",
    description: "Funds route through three jurisdictions the customer has never transacted with before.",
    expectedNarrative: "Cross-border pattern with a potential sanctions match — AI refers for review.",
  },
  {
    id: "structuring",
    title: "Structuring",
    description: "A series of deposits just under the $10,000 reporting threshold over consecutive days.",
    expectedNarrative: "Confirmed sanctions hit alongside a textbook structuring pattern — AI recommends escalation.",
  },
  {
    id: "false_positive",
    title: "False positive",
    description: "A single large but well-documented purchase from a long-tenured, low-risk customer.",
    expectedNarrative: "Clean sanctions screening and no other red flags — AI recommends clearing the alert.",
  },
];

function baseCustomer(id: string, name: string, overrides: Partial<Customer> = {}): Customer {
  const now = new Date();
  return {
    id,
    organization_id: DEMO_ORGANIZATION_ID,
    external_customer_id: `CUST-${id.slice(0, 8).toUpperCase()}`,
    full_name: name,
    email: null,
    phone: null,
    date_of_birth: null,
    country_code: "US",
    status: "ACTIVE",
    risk_rating: "MEDIUM",
    kyc_status: "VERIFIED",
    account_opened_at: new Date(now.getTime() - 500 * 86400_000).toISOString(),
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    ...overrides,
  };
}

function baseProfile(customerId: string, overrides: Partial<CustomerProfile> = {}): CustomerProfile {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    organization_id: DEMO_ORGANIZATION_ID,
    customer_id: customerId,
    occupation: "Consultant",
    employer: null,
    expected_monthly_volume: 6000,
    average_transaction_amount: 400,
    typical_countries: ["US"],
    typical_beneficiaries: [],
    behavioral_baseline: {},
    sanctions_status: "CLEAR",
    sanctions_checked_at: now,
    pep_status: false,
    notes: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function txn(id: string, customerId: string, overrides: Partial<Transaction> = {}, minutesAgo = 0): Transaction {
  const now = Date.now();
  return {
    id,
    organization_id: DEMO_ORGANIZATION_ID,
    customer_id: customerId,
    external_transaction_id: null,
    direction: "OUTBOUND",
    amount: 500,
    currency: "USD",
    channel: "ACH",
    status: "COMPLETED",
    counterparty_name: null,
    counterparty_account: `acct-${id.slice(0, 8)}`,
    counterparty_country: "US",
    origin_country: "US",
    destination_country: "US",
    device_id: "device-known",
    device_is_new: false,
    ip_address: null,
    transaction_at: new Date(now - minutesAgo * 60_000).toISOString(),
    created_at: new Date(now - minutesAgo * 60_000).toISOString(),
    ...overrides,
  };
}

function buildAlert(id: string, customerId: string, transactionId: string | null, overrides: Partial<Alert>): Alert {
  const now = new Date().toISOString();
  return {
    id,
    organization_id: DEMO_ORGANIZATION_ID,
    customer_id: customerId,
    transaction_id: transactionId,
    related_transaction_ids: [],
    alert_type: "OTHER",
    severity: "MEDIUM",
    status: "RECEIVED",
    source: "RULE_ENGINE",
    triggered_rules: [],
    risk_score: 0.5,
    ml_score: null,
    assigned_analyst_id: null,
    opened_at: now,
    resolved_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function buildScenario(id: DemoScenarioId): DemoScenarioSeed {
  const suffix = randomUUID().slice(0, 8);
  const customerId = `demo-${id}-${suffix}`;
  const alertId = `demo-alert-${id}-${suffix}`;

  switch (id) {
    case "high_velocity": {
      const customer = baseCustomer(customerId, "Marcus Feld");
      const profile = baseProfile(customerId, { sanctions_status: "CONFIRMED_MATCH" });
      const transactions: Transaction[] = [];
      for (let i = 8; i >= 1; i--) {
        transactions.push(txn(`${customerId}-txn-${i}`, customerId, { amount: 900 + i * 140 }, i * 14));
      }
      const primary = transactions[transactions.length - 1] as Transaction;
      const alert = buildAlert(alertId, customerId, primary.id, {
        alert_type: "VELOCITY_ANOMALY",
        severity: "HIGH",
        triggered_rules: ["RULE_VELOCITY_8_IN_2H"],
        risk_score: 0.86,
        related_transaction_ids: transactions.map((t) => t.id),
      });
      return { customer, profile, transactions, alert };
    }

    case "new_device_large_transfer": {
      const customer = baseCustomer(customerId, "Priya Anand");
      const profile = baseProfile(customerId, {
        sanctions_status: "POTENTIAL_MATCH",
        average_transaction_amount: 350,
      });
      const primary = txn(`${customerId}-txn-1`, customerId, {
        amount: 48000,
        device_id: `device-new-${suffix}`,
        device_is_new: true,
      });
      const history = [
        txn(`${customerId}-txn-h1`, customerId, { amount: 320 }, 60 * 24 * 3),
        txn(`${customerId}-txn-h2`, customerId, { amount: 410 }, 60 * 24 * 10),
      ];
      const alert = buildAlert(alertId, customerId, primary.id, {
        alert_type: "NEW_DEVICE",
        severity: "HIGH",
        triggered_rules: ["RULE_NEW_DEVICE_LARGE_AMOUNT"],
        risk_score: 0.74,
      });
      return { customer, profile, transactions: [primary, ...history], alert };
    }

    case "multi_country_anomaly": {
      const customer = baseCustomer(customerId, "Elin Sorensen", { country_code: "SE" });
      const profile = baseProfile(customerId, {
        sanctions_status: "POTENTIAL_MATCH",
        typical_countries: ["SE"],
      });
      const primary = txn(`${customerId}-txn-1`, customerId, {
        amount: 15200,
        origin_country: "SE",
        destination_country: "KY",
        counterparty_country: "NG",
      });
      const history = [txn(`${customerId}-txn-h1`, customerId, { amount: 600, origin_country: "SE" }, 60 * 24 * 20)];
      const alert = buildAlert(alertId, customerId, primary.id, {
        alert_type: "COUNTRY_RISK",
        severity: "HIGH",
        triggered_rules: ["RULE_MULTI_JURISDICTION"],
        risk_score: 0.71,
      });
      return { customer, profile, transactions: [primary, ...history], alert };
    }

    case "structuring": {
      const customer = baseCustomer(customerId, "Robert Ilic");
      const profile = baseProfile(customerId, { sanctions_status: "CONFIRMED_MATCH" });
      const transactions = [9800, 9600, 9450].map((amount, i) =>
        txn(`${customerId}-txn-${i}`, customerId, { amount, direction: "INBOUND" }, i * 60 * 24)
      );
      const primary = transactions[0] as Transaction;
      const alert = buildAlert(alertId, customerId, primary.id, {
        alert_type: "STRUCTURING",
        severity: "CRITICAL",
        triggered_rules: ["RULE_STRUCTURING_SUB_THRESHOLD"],
        risk_score: 0.91,
        related_transaction_ids: transactions.map((t) => t.id),
      });
      return { customer, profile, transactions, alert };
    }

    case "false_positive": {
      const customer = baseCustomer(customerId, "Grace Whitfield", {
        account_opened_at: new Date(Date.now() - 2200 * 86400_000).toISOString(),
        risk_rating: "LOW",
      });
      const profile = baseProfile(customerId, {
        sanctions_status: "CLEAR",
        average_transaction_amount: 900,
        expected_monthly_volume: 12000,
      });
      const primary = txn(`${customerId}-txn-1`, customerId, { amount: 8200, counterparty_name: "Kitchen Renovation Co." });
      const history = [
        txn(`${customerId}-txn-h1`, customerId, { amount: 750 }, 60 * 24 * 5),
        txn(`${customerId}-txn-h2`, customerId, { amount: 880 }, 60 * 24 * 12),
      ];
      const alert = buildAlert(alertId, customerId, primary.id, {
        alert_type: "AMOUNT_ANOMALY",
        severity: "LOW",
        triggered_rules: ["RULE_AMOUNT_OUTLIER"],
        risk_score: 0.31,
      });
      return { customer, profile, transactions: [primary, ...history], alert };
    }
  }
}

export function isDemoScenarioId(value: string): value is DemoScenarioId {
  return DEMO_SCENARIOS.some((s) => s.id === value);
}

export { buildScenario };
