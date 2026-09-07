/**
 * Small, generic helpers shared by the dashboard's read-only API routes
 * (app/api/alerts, /cases, /customers, /audit, /models, /dashboard) — no
 * ML/Claude/Hermes/database business logic here, only presentation-layer
 * shaping of data those layers already computed. Mirrors the same
 * org-boundary pattern already established in lib/hermes/tools/types.ts's
 * `scopeToOrg`, duplicated here (not imported) because that module is
 * Hermes-internal and this one is not.
 */
export function scopeToOrg<T extends { organization_id: string }>(
  entity: T | null,
  organizationId: string
): T | null {
  if (!entity) return null;
  return entity.organization_id === organizationId ? entity : null;
}
