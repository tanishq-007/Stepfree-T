import { CheckCircle2, HelpCircle, XCircle } from "lucide-react";
import type { AccessStatus } from "@/lib/types";

// Icon AND text for every status. Tint pairs (measured): green-800 on green-50 6.8:1, red-800 on red-50
// 7.9:1, gray-700 on gray-100 9.3:1.
export const STATUS_META: Record<AccessStatus, { label: string; Icon: typeof CheckCircle2; chip: string; dot: string }> = {
  STEP_FREE: { label: "Step-free", Icon: CheckCircle2, chip: "bg-status-free-tint text-status-free border-green-200", dot: "bg-status-free" },
  NOT_STEP_FREE: { label: "Not step-free", Icon: XCircle, chip: "bg-status-blocked-tint text-status-blocked border-red-200", dot: "bg-status-blocked" },
  UNKNOWN: { label: "Cannot confirm", Icon: HelpCircle, chip: "bg-status-unknown-tint text-status-unknown border-gray-300", dot: "bg-status-unknown" },
};

export default function StatusChip({ status, size = "sm", label }: { status: AccessStatus; size?: "xs" | "sm"; label?: string }) {
  const m = STATUS_META[status];
  const Icon = m.Icon;
  return (
    <span data-status={status} className={`chip shrink-0 border ${m.chip} ${size === "xs" ? "px-2 py-0 text-xs" : "px-2.5 py-0.5"}`}>
      <Icon className={size === "xs" ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden="true" />
      {label ?? m.label}
    </span>
  );
}
