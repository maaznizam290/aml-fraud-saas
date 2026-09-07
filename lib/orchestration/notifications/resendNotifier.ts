import type { NotificationPayload, NotificationProvider } from "./provider.js";

/** Plain fetch against the Resend HTTP API rather than the `resend` npm
 * package — one fewer dependency for a single POST call. */
export class ResendNotifier implements NotificationProvider {
  readonly channelName = "resend";

  constructor(
    private readonly apiKey: string,
    private readonly fromAddress: string,
    private readonly toAddress: string,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async send(payload: NotificationPayload): Promise<void> {
    const response = await this.fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        from: this.fromAddress,
        to: [this.toAddress],
        subject: payload.title,
        text: payload.body,
      }),
    });
    if (!response.ok) {
      throw new Error(`Resend API returned HTTP ${response.status}`);
    }
  }
}
