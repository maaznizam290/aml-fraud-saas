/** Narrows a `Json` column value (jsonb) to a string array for display —
 * several columns (triggered_rules, red_flags, supporting_evidence, ...)
 * are stored as jsonb string arrays but typed as the broader `Json` union. */
export function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}
