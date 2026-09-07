import type { Customer, CustomerProfile, Transaction, Alert } from "../../lib/supabase/types.js";

const ORG_ID = "org-test-0001";

export function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  const now = new Date().toISOString();
  return {
    id: "cust-test-0001",
    organization_id: ORG_ID,
    external_customer_id: "CUST-0001",
    full_name: "Test Customer",
    email: null,
    phone: null,
    date_of_birth: null,
    country_code: "US",
    status: "ACTIVE",
    risk_rating: "MEDIUM",
    kyc_status: "VERIFIED",
    account_opened_at: new Date(Date.now() - 400 * 86400_000).toISOString(),
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

export function makeCustomerProfile(overrides: Partial<CustomerProfile> = {}): CustomerProfile {
  const now = new Date().toISOString();
  return {
    id: "profile-test-0001",
    organization_id: ORG_ID,
    customer_id: "cust-test-0001",
    occupation: null,
    employer: null,
    expected_monthly_volume: 4000,
    average_transaction_amount: 300,
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

export function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  const now = new Date().toISOString();
  return {
    id: "txn-test-0001",
    organization_id: ORG_ID,
    customer_id: "cust-test-0001",
    external_transaction_id: null,
    direction: "OUTBOUND",
    amount: 250,
    currency: "USD",
    channel: "ACH",
    status: "COMPLETED",
    counterparty_name: null,
    counterparty_account: "acct-known",
    counterparty_country: "US",
    origin_country: "US",
    destination_country: "US",
    device_id: "device-known",
    device_is_new: false,
    ip_address: null,
    transaction_at: now,
    created_at: now,
    ...overrides,
  };
}

export function makeAlert(overrides: Partial<Alert> = {}): Alert {
  const now = new Date().toISOString();
  return {
    id: "alert-test-0001",
    organization_id: ORG_ID,
    customer_id: "cust-test-0001",
    transaction_id: "txn-test-0001",
    related_transaction_ids: [],
    alert_type: "AMOUNT_ANOMALY",
    severity: "MEDIUM",
    status: "RECEIVED",
    source: "RULE_ENGINE",
    triggered_rules: ["RULE_TEST"],
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

export const TEST_ORG_ID = ORG_ID;
