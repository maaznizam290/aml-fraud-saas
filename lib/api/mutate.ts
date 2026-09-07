/**
 * POST/action helper used by every mutating form (human review, case
 * resolution, demo trigger, governance transitions, skill/candidate
 * proposals). Throws a readable Error on failure so callers can show it in
 * a form-level error state (task section 9).
 */
export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const message =
      parsed && typeof parsed === "object" && ("error" in parsed || "detail" in parsed)
        ? String((parsed as { detail?: unknown; error?: unknown }).detail ?? (parsed as { error?: unknown }).error)
        : `Request failed with status ${res.status}`;
    throw new Error(message);
  }
  return parsed as T;
}
