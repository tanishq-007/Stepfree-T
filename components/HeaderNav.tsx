"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Map, PencilLine } from "lucide-react";

const LINKS = [
  { href: "/", label: "My Trip", Icon: Map },
  { href: "/trip/new", label: "Edit Trip", Icon: PencilLine },
] as const;

export default function HeaderNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="flex items-center gap-1">
      {LINKS.map(({ href, label, Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`btn inline-flex items-center gap-2 whitespace-nowrap px-2.5 text-sm font-semibold transition-colors sm:px-3 ${
              active
                ? "bg-brand-50 text-brand-900"
                : "text-ink-soft hover:bg-surface-sunken hover:text-ink"
            }`}
          >
            <Icon className="hidden h-4 w-4 sm:block" aria-hidden="true" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
