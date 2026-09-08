import type { HistoricalCase } from "./ruleEngine.js";

/**
 * Fixed synthetic historical case set used to backtest Hermes-proposed
 * heuristic rules before they can ever be promoted to DEPLOYED. This is
 * intentionally in-memory and deterministic — it is a governance sandbox,
 * not production transaction history.
 */
export const HISTORICAL_SEED_CASES: HistoricalCase[] = [
  { id: "seed-001", amount_pkr: 5000, velocity_last_24h: 1, account_age_days: 400, device_risk_score: 0.05, actual_fraud: false },
  { id: "seed-002", amount_pkr: 12000, velocity_last_24h: 2, account_age_days: 220, device_risk_score: 0.1, actual_fraud: false },
  { id: "seed-003", amount_pkr: 250000, velocity_last_24h: 1, account_age_days: 1, device_risk_score: 0.8, actual_fraud: true },
  { id: "seed-004", amount_pkr: 180000, velocity_last_24h: 4, account_age_days: 2, device_risk_score: 0.75, actual_fraud: true },
  { id: "seed-005", amount_pkr: 3000, velocity_last_24h: 0, account_age_days: 900, device_risk_score: 0.02, actual_fraud: false },
  { id: "seed-006", amount_pkr: 95000, velocity_last_24h: 6, account_age_days: 1, device_risk_score: 0.6, actual_fraud: true },
  { id: "seed-007", amount_pkr: 40000, velocity_last_24h: 1, account_age_days: 45, device_risk_score: 0.15, actual_fraud: false },
  { id: "seed-008", amount_pkr: 60000, velocity_last_24h: 2, account_age_days: 2, device_risk_score: 0.55, actual_fraud: true },
  { id: "seed-009", amount_pkr: 15000, velocity_last_24h: 1, account_age_days: 730, device_risk_score: 0.03, actual_fraud: false },
  { id: "seed-010", amount_pkr: 210000, velocity_last_24h: 8, account_age_days: 0.5, device_risk_score: 0.9, actual_fraud: true },
  { id: "seed-011", amount_pkr: 8000, velocity_last_24h: 1, account_age_days: 150, device_risk_score: 0.08, actual_fraud: false },
  { id: "seed-012", amount_pkr: 72000, velocity_last_24h: 3, account_age_days: 1, device_risk_score: 0.5, actual_fraud: true },
  { id: "seed-013", amount_pkr: 500, velocity_last_24h: 0, account_age_days: 5, device_risk_score: 0.2, actual_fraud: false },
  { id: "seed-014", amount_pkr: 130000, velocity_last_24h: 5, account_age_days: 2, device_risk_score: 0.7, actual_fraud: true },
  { id: "seed-015", amount_pkr: 25000, velocity_last_24h: 2, account_age_days: 60, device_risk_score: 0.2, actual_fraud: false },
  { id: "seed-016", amount_pkr: 55000, velocity_last_24h: 1, account_age_days: 2.5, device_risk_score: 0.4, actual_fraud: true },
  { id: "seed-017", amount_pkr: 9000, velocity_last_24h: 1, account_age_days: 500, device_risk_score: 0.05, actual_fraud: false },
  { id: "seed-018", amount_pkr: 51000, velocity_last_24h: 1, account_age_days: 2, device_risk_score: 0.35, actual_fraud: true },
  { id: "seed-019", amount_pkr: 30000, velocity_last_24h: 1, account_age_days: 10, device_risk_score: 0.1, actual_fraud: false },
  { id: "seed-020", amount_pkr: 48000, velocity_last_24h: 1, account_age_days: 4, device_risk_score: 0.3, actual_fraud: false },
];
