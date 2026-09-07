import { cn } from "../../lib/ui/cn.js";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-surface-sunken", className)} {...props} />;
}
