import type { NotificationPayload, NotificationProvider } from "./provider.js";

/** Uses a Slack Incoming Webhook URL (SLACK_WEBHOOK_URL) rather than a bot
 * token — no scopes to manage, and it's exactly enough for one-way
 * analyst alerts. */
export class SlackNotifier implements NotificationProvider {
  readonly channelName = "slack";

  constructor(
    private readonly webhookUrl: string,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async send(payload: NotificationPayload): Promise<void> {
    const response = await this.fetchImpl(this.webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: `*${payload.title}*\n${payload.body}` }),
    });
    if (!response.ok) {
      throw new Error(`Slack webhook returned HTTP ${response.status}`);
    }
  }
}
