/** "3:05 PM" in the rider's own time zone, or "unknown time" for a bad value. */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "unknown time" : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
