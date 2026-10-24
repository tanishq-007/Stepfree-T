import { AlertTriangle, ArrowRightCircle, CircleHelp, FlaskConical, ListChecks, Sparkles, UserRound } from "lucide-react";
import type { AccessStatus, UserProfile } from "@/lib/types";
import type { ExplainPayload } from "@/lib/client/types";
import { PROFILE_LABEL } from "@/lib/engine/profiles";

/**
 * "Understand your journey". Three questions answered from the explainer's guide.
 * The verdict is NOT decided here: it is passed in from the engine and only displayed.
 * "AI-generated" shows only when the server says the guide text came from a validated AI response.
 */
export default function JourneyExplainer({
  status,
  profile,
  explanation,
  loading,
  simulated,
}: {
  status: AccessStatus;
  profile: UserProfile;
  explanation: ExplainPayload | null;
  loading: boolean;
  simulated: boolean;
}) {
  const guide = explanation?.guide;
  const ai = guide?.source === "ai";

  return (
    <section aria-labelledby="explainer-h" aria-busy={loading} className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="explainer-h" className="text-xl font-extrabold text-ink">
          Understand your journey
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {simulated ? (
            <span className="chip bg-violet-100 px-2 py-0 text-xs font-extrabold uppercase tracking-wider text-violet-900">
              <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
              Simulated
            </span>
          ) : null}
          {ai ? (
            <span className="chip border border-brand-200 bg-brand-50 px-2 py-0 text-xs text-brand-800">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              AI-generated, checked against the rules
            </span>
          ) : guide ? (
            <span className="chip border border-hairline bg-surface-sunken px-2 py-0 text-xs text-ink-soft">Plain-language templates</span>
          ) : null}
        </div>
      </div>

      {loading && !guide ? (
        <div className="mt-4 space-y-3" role="status" aria-busy="true">
          <span className="sr-only">Writing the explanation…</span>
          <div className="skeleton h-16" />
          <div className="skeleton h-16" />
          <div className="skeleton h-20" />
        </div>
      ) : !guide ? (
        <p className="mt-3 text-sm text-ink-soft">The explanation is not available right now. The verdict above and the evidence below still apply.</p>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
          <Q Icon={status === "STEP_FREE" ? CircleHelp : AlertTriangle} title="What happened?" tone={status}>
            <p>{guide.whatHappened}</p>
          </Q>
          <Q Icon={UserRound} title="Why does it affect me?" tone="neutral" sub={PROFILE_LABEL[profile]}>
            <p>{guide.whyItMatters}</p>
          </Q>
          <Q Icon={ListChecks} title="What can I do next?" tone="neutral">
            <ul className="space-y-1.5">
              {guide.nextSteps.map((s) => (
                <li key={s.id} className="flex gap-2">
                  <ArrowRightCircle className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
                  <span>{s.text}</span>
                </li>
              ))}
            </ul>
          </Q>
        </div>
      )}
      <p className="mt-3 text-xs text-ink-muted">The step-free verdict comes from fixed rules, not AI. The explanation can only describe it.</p>
    </section>
  );
}

function Q({
  Icon,
  title,
  sub,
  tone,
  children,
}: {
  Icon: typeof AlertTriangle;
  title: string;
  sub?: string;
  tone: AccessStatus | "neutral";
  children: React.ReactNode;
}) {
  const ring =
    tone === "NOT_STEP_FREE" ? "bg-status-blocked-tint text-status-blocked" : tone === "UNKNOWN" ? "bg-status-unknown-tint text-status-unknown" : tone === "STEP_FREE" ? "bg-status-free-tint text-status-free" : "bg-brand-50 text-brand-800";
  return (
    <div className="rounded-2xl border border-hairline bg-surface-base p-4">
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${ring}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <h3 className="text-sm font-bold text-ink">{title}</h3>
        {sub ? <span className="ml-auto text-xs font-semibold text-ink-muted">{sub}</span> : null}
      </div>
      <div className="mt-2 text-sm leading-relaxed text-ink-soft">{children}</div>
    </div>
  );
}
