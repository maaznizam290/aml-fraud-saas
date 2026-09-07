"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { cn } from "../../lib/ui/cn.js";
import { NAV_ITEMS } from "./nav-items.js";

export function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className={cn("flex h-full w-64 shrink-0 flex-col border-r border-line bg-surface-raised", className)}
    >
      <Link href="/dashboard" className="flex items-center gap-2 px-5 py-5">
        <ShieldCheck className="h-6 w-6 text-brand-600" aria-hidden="true" />
        <span className="text-base font-semibold tracking-tight text-ink-primary">Meridian AML</span>
      </Link>
      <ul className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-4">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-brand-50 text-brand-700"
                    : "text-ink-secondary hover:bg-surface-sunken hover:text-ink-primary"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
