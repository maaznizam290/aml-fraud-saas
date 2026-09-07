"use client";

import { useSession } from "../../../lib/auth/session.js";
import { AuditTimeline } from "../../../components/domain/AuditTimeline.js";

export default function AuditTrailPage() {
  const { identity } = useSession();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-primary">Audit Trail</h1>
        <p className="text-sm text-ink-muted">
          Every alert, evidence, ML, AI, analyst, case, notification, and learning event across the organization, in
          one chronological record.
        </p>
      </div>
      {identity && <AuditTimeline organizationId={identity.organizationId} />}
    </div>
  );
}
