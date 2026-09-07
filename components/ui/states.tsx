import { AlertTriangle, Inbox, Loader2 } from "lucide-react";

import { Button } from "./button.js";

/** Every major API interaction needs loading/empty/error states (task
 * section 9) — these three are the shared vocabulary every page uses so
 * they read consistently across the whole app. */

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" className="flex flex-col items-center justify-center gap-3 py-16 text-ink-muted">
      <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line py-16 text-center">
      <Inbox className="mb-1 h-8 w-8 text-ink-muted" aria-hidden="true" />
      <p className="text-sm font-medium text-ink-primary">{title}</p>
      {description && <p className="max-w-sm text-sm text-ink-muted">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  detail,
  onRetry,
}: {
  title?: string;
  detail?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 rounded-xl border border-status-critical/30 bg-status-critical/5 py-16 text-center"
    >
      <AlertTriangle className="h-7 w-7 text-status-critical" aria-hidden="true" />
      <div>
        <p className="text-sm font-medium text-ink-primary">{title}</p>
        {detail && <p className="mt-1 max-w-md text-sm text-ink-muted">{detail}</p>}
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
