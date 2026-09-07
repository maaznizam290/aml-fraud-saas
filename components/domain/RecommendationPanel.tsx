import { AlertTriangle, CheckCircle2, MinusCircle, Sparkles } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card.js";
import { Badge } from "../ui/badge.js";
import { DispositionBadge } from "./badges.js";
import { asStringList } from "../../lib/ui/json.js";
import type { AiRecommendation } from "../../lib/supabase/types.js";

/**
 * Renders Claude's structured investigation output exactly as recorded
 * (task section 7) — never implying the AI made the final call. Every
 * field maps 1:1 to an `ai_recommendations` column; nothing is
 * reformulated or summarized further than the model already did.
 */
export function RecommendationPanel({ recommendation }: { recommendation: AiRecommendation }) {
  const redFlags = asStringList(recommendation.red_flags);
  const supporting = asStringList(recommendation.supporting_evidence);
  const contradictory = asStringList(recommendation.contradictory_evidence);
  const nextSteps = asStringList(recommendation.recommended_next_steps);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand-600" aria-hidden="true" />
            AI investigation
          </CardTitle>
          <CardDescription>
            {recommendation.provider}/{recommendation.model_name} — a recommendation for a human analyst to decide
            on, not a decision.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <DispositionBadge disposition={recommendation.disposition} />
          <Badge variant="neutral">{Math.round((recommendation.confidence ?? 0) * 100)}% confidence</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <p className="text-sm leading-relaxed text-ink-primary">{recommendation.rationale}</p>

        {recommendation.investigation_summary && (
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">Investigation summary</h4>
            <p className="text-sm text-ink-secondary">{recommendation.investigation_summary}</p>
          </div>
        )}

        {recommendation.ml_score_assessment && (
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">ML score assessment</h4>
            <p className="text-sm text-ink-secondary">{recommendation.ml_score_assessment}</p>
          </div>
        )}

        {redFlags.length > 0 && (
          <div>
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-status-critical">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Red flags
            </h4>
            <ul className="flex flex-col gap-1.5">
              {redFlags.map((flag, i) => (
                <li key={i} className="rounded-md bg-status-critical/5 px-3 py-2 text-sm text-ink-primary">
                  {flag}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#006300]">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Supporting evidence
            </h4>
            {supporting.length === 0 ? (
              <p className="text-sm text-ink-muted">None cited.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {supporting.map((item, i) => (
                  <li key={i} className="rounded-md border border-line bg-surface-sunken px-3 py-2 font-mono text-xs text-ink-secondary">
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              <MinusCircle className="h-3.5 w-3.5" aria-hidden="true" /> Contradictory evidence
            </h4>
            {contradictory.length === 0 ? (
              <p className="text-sm text-ink-muted">None cited.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {contradictory.map((item, i) => (
                  <li key={i} className="rounded-md border border-line bg-surface-sunken px-3 py-2 font-mono text-xs text-ink-secondary">
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {nextSteps.length > 0 && (
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Recommended next steps</h4>
            <ol className="flex flex-col gap-1.5">
              {nextSteps.map((step, i) => (
                <li key={i} className="flex gap-2 text-sm text-ink-primary">
                  <span className="font-medium text-brand-600">{i + 1}.</span> {step}
                </li>
              ))}
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
