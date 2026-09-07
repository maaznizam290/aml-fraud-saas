import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/ui/cn.js";

/**
 * Status colors are reserved for actual status meaning (good/warning/
 * serious/critical) and always paired with a label, never color alone —
 * see the dataviz skill's "Status palette (fixed — never themed)".
 * `neutral`/`brand` variants are for non-status badges (roles, types).
 */
const badgeVariants = cva("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", {
  variants: {
    variant: {
      neutral: "bg-surface-sunken text-ink-secondary",
      brand: "bg-brand-50 text-brand-700",
      good: "bg-[#0ca30c]/10 text-[#0a7a0a]",
      warning: "bg-[#fab219]/15 text-[#8a5a00]",
      serious: "bg-[#ec835a]/15 text-[#a34319]",
      critical: "bg-[#d03b3b]/10 text-[#a52222]",
    },
  },
  defaultVariants: { variant: "neutral" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
