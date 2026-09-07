/**
 * Notification provider abstraction (task section 10). Each provider does
 * exactly one thing — send one message to one external channel — and is
 * allowed to throw; it is `NotificationDispatcher` (notifier.ts) that
 * guarantees a failure here never propagates out to the investigation or
 * human-review pipeline.
 */
import type { Json } from "../../supabase/types.js";

export interface NotificationPayload {
  title: string;
  body: string;
  metadata?: Record<string, Json>;
}

export interface NotificationProvider {
  readonly channelName: string;
  send(payload: NotificationPayload): Promise<void>;
}
