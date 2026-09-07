/**
 * Webhook signature validation (task section 3). The secret is never
 * echoed back, never logged, and compared with a timing-safe comparison so
 * a failed attempt can't be used to brute-force the signature byte by byte.
 *
 * Signature scheme: `X-AML-Signature: sha256=<hex hmac of the raw body>`,
 * HMAC-SHA256 keyed by AML_WEBHOOK_SECRET. This mirrors the common
 * GitHub/Stripe-style webhook signing convention.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export function computeWebhookSignature(secret: string, rawBody: string): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

export function verifyWebhookSignature(secret: string, rawBody: string, providedSignature: string | null): boolean {
  if (!providedSignature) return false;

  const expected = computeWebhookSignature(secret, rawBody);
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(providedSignature);

  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}
