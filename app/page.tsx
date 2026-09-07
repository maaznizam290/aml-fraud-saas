import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Brain,
  Fingerprint,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

import { buttonVariants } from "../components/ui/button.js";

const VALUE_PROPS = [
  {
    icon: ScanSearch,
    title: "AI-powered AML investigation",
    description:
      "Every alert is automatically enriched with transaction history, KYC context, sanctions screening, and deterministic risk signals before an analyst ever opens it.",
  },
  {
    icon: Sparkles,
    title: "Explainable risk, not a black box",
    description:
      "Every recommendation ships with its rationale, red flags, and a confidence score — never a bare score with no reasoning behind it.",
  },
  {
    icon: Fingerprint,
    title: "Evidence-driven, citation by citation",
    description:
      "Supporting and contradictory evidence are shown side by side, each traceable to the transaction, signal, or screening result it came from.",
  },
  {
    icon: Users,
    title: "Human-in-the-loop, always",
    description:
      "The AI recommends. It never files a SAR, closes an account, or moves funds. Every consequential action requires an analyst's approval.",
  },
  {
    icon: Brain,
    title: "Self-learning compliance intelligence",
    description:
      "Analyst decisions become structured feedback. Recurring patterns surface as reviewable proposals — never an automatic policy or model change.",
  },
  {
    icon: BadgeCheck,
    title: "Built for the audit",
    description:
      "Every step — evidence, ML, AI, analyst, case, notification, learning — is written to one chronological, tamper-evident trail.",
  },
];

const PIPELINE_STEPS = [
  "Transaction",
  "Alert",
  "Evidence",
  "ML Risk Score",
  "AI Investigation",
  "Recommendation",
  "Human Review",
  "Case & Audit",
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-surface-page">
      <header className="border-b border-line bg-surface-raised">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-brand-600" aria-hidden="true" />
            <span className="text-base font-semibold tracking-tight">Meridian AML</span>
          </div>
          <nav className="flex items-center gap-3">
            <Link href="/dashboard" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              View the platform
            </Link>
            <Link href="/demo" className={buttonVariants({ size: "sm" })}>
              Launch demo <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-20 pt-16 sm:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> AI-assisted, analyst-approved
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-ink-primary sm:text-5xl">
            Investigate fraud and AML alerts with explainable AI — and a human who always has the final word.
          </h1>
          <p className="mt-5 text-lg text-ink-secondary">
            Meridian AML turns every suspicious transaction into a fully-evidenced investigation in seconds —
            evidence collection, deterministic risk scoring, and an AI-generated recommendation your analysts can
            trust, verify, and override.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/demo" className={buttonVariants({ size: "lg" })}>
              Launch the investigation demo <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link href="/dashboard" className={buttonVariants({ size: "lg", variant: "secondary" })}>
              Explore the workspace
            </Link>
          </div>
        </div>

        <div className="mx-auto mt-16 max-w-4xl overflow-x-auto rounded-xl border border-line bg-surface-raised p-6 shadow-card">
          <p className="mb-4 text-center text-xs font-medium uppercase tracking-wide text-ink-muted">
            One suspicious transaction, fully investigated
          </p>
          <div className="flex min-w-[720px] items-center justify-between">
            {PIPELINE_STEPS.map((step, i) => (
              <div key={step} className="flex flex-1 items-center">
                <div className="flex flex-col items-center gap-2 text-center">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-700 text-xs font-semibold text-white">
                    {i + 1}
                  </div>
                  <span className="w-24 text-xs font-medium text-ink-secondary">{step}</span>
                </div>
                {i < PIPELINE_STEPS.length - 1 && <div className="mx-1 h-px flex-1 bg-line" aria-hidden="true" />}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-line bg-surface-raised py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-2xl font-semibold text-ink-primary">
            Everything a compliance team needs to trust an AI recommendation
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {VALUE_PROPS.map(({ icon: Icon, title, description }) => (
              <div key={title} className="rounded-xl border border-line p-5">
                <Icon className="h-6 w-6 text-brand-600" aria-hidden="true" />
                <h3 className="mt-3 text-sm font-semibold text-ink-primary">{title}</h3>
                <p className="mt-1.5 text-sm text-ink-secondary">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-16 text-center">
        <h2 className="text-2xl font-semibold text-ink-primary">Built for teams who answer to a regulator</h2>
        <p className="mt-3 text-ink-secondary">
          Banks, fintechs, payment companies, and compliance and fraud teams use Meridian AML as the system of record
          for every investigation — from the first alert to the filed disposition.
        </p>
        <div className="mt-8">
          <Link href="/demo" className={buttonVariants({ size: "lg" })}>
            See it investigate a live scenario <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-line py-8 text-center text-xs text-ink-muted">
        Meridian AML — a demonstration compliance platform. Synthetic data only.
      </footer>
    </div>
  );
}
