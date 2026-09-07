import { z } from "zod";

/** Validates the raw `aml-fraud-alert` webhook body (task section 3/4)
 * before anything else touches it. Rejects with a clear error rather than
 * guessing at missing/malformed fields. */
export const alertWebhookSchema = z.object({
  alertId: z.string().min(1),
  organizationId: z.string().min(1),
  customerId: z.string().min(1),
  transactionId: z.string().min(1).nullable().default(null),
  alertType: z.enum([
    "AMOUNT_ANOMALY",
    "VELOCITY_ANOMALY",
    "NEW_BENEFICIARY",
    "NEW_DEVICE",
    "LOCATION_ANOMALY",
    "COUNTRY_RISK",
    "STRUCTURING",
    "SANCTIONS_HIT",
    "KYC_ISSUE",
    "BEHAVIORAL_ANOMALY",
    "OTHER",
  ]),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  triggeredRules: z.array(z.string()).default([]),
  riskScore: z.number().min(0).max(1).nullable().default(null),
  mlScore: z.number().min(0).max(1).nullable().default(null),
  source: z.string().default("EXTERNAL_SYSTEM"),
  occurredAt: z.string().datetime().or(z.string().min(1)),
});

export type AlertWebhookBody = z.infer<typeof alertWebhookSchema>;
