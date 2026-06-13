import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Dark-glass card matching the /r report aesthetic, but standalone so the
 * welcome surface can use it without the report shell. Surfaces are gulf tokens;
 * accents come from the incoming brand vars at the call site.
 */
export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "flex flex-col rounded-xl border border-white/10 bg-white/[0.04] text-text-primary",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div data-slot="card-header" className={cn("flex flex-col gap-1 p-4", className)} {...props} />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("text-xs font-medium uppercase tracking-wider text-text-tertiary", className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("p-4 pt-0", className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center gap-2 p-4 pt-0", className)}
      {...props}
    />
  );
}
