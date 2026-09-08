import type { AlertStatus, AlertWithTransaction, HermesRule } from "../types.js";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error ?? `Request to ${path} failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function listAlerts(status?: AlertStatus): Promise<{ alerts: AlertWithTransaction[] }> {
  const query = status ? `?status=${status}` : "";
  return request(`/alerts${query}`);
}

export function resolveAlert(
  alertId: string,
  decision: "APPROVE" | "BLOCK",
  userId: string,
): Promise<{ alert: AlertWithTransaction }> {
  return request(`/alerts/${alertId}/resolve`, {
    method: "POST",
    headers: { "x-user-id": userId },
    body: JSON.stringify({ decision }),
  });
}

export function listHermesRules(): Promise<{ rules: HermesRule[] }> {
  return request("/hermes/rules");
}

export function synthesizeHermesRules(): Promise<{
  rules: Array<{ rule: HermesRule; rationale: string }>;
  message?: string;
}> {
  return request("/hermes/synthesize", { method: "POST" });
}

export function promoteHermesRule(
  ruleId: string,
  userId: string,
): Promise<{ rule: HermesRule }> {
  return request(`/hermes/rules/${ruleId}/promote`, {
    method: "POST",
    headers: { "x-user-id": userId },
  });
}

export function subscribeToDashboardEvents(onEvent: (raw: string) => void): () => void {
  const source = new EventSource(`${API_BASE}/alerts/stream/live`);
  source.onmessage = (event) => onEvent(event.data);
  return () => source.close();
}
