import { CheckCircle2, HelpCircle, XCircle } from "lucide-react";

/** Map legend. Every colour is paired with the same glyph used on the map AND a text label. */
export default function MapLegend({ simulated }: { simulated: boolean }) {
  const items = [
    { Icon: CheckCircle2, cls: "text-status-free", label: "Step-free", note: "verified for your profile" },
    { Icon: XCircle, cls: "text-status-blocked", label: "Not step-free", note: "known blocker" },
    { Icon: HelpCircle, cls: "text-status-unknown", label: "Cannot confirm", note: "not enough data" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-soft">
      <span className="font-bold text-ink">{simulated ? "Simulated stations:" : "Stations:"}</span>
      {items.map(({ Icon, cls, label, note }) => (
        <span key={label} className="inline-flex items-center gap-1">
          <Icon className={`h-4 w-4 ${cls}`} aria-hidden="true" />
          <span className="font-semibold text-ink">{label}</span>
          <span className="hidden sm:inline">({note})</span>
        </span>
      ))}
      <span className="inline-flex items-center gap-1">
        <span className="h-3.5 w-3.5 rounded-full border-[3px] border-ink bg-white" aria-hidden="true" />
        <span className="font-semibold text-ink">Your stations</span>
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="h-3.5 w-3.5 rounded-full border-[3px] border-status-free bg-white" aria-hidden="true" />
        <span className="font-semibold text-ink">Alternative</span>
      </span>
    </div>
  );
}
