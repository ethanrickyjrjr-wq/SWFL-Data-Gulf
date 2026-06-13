import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** Shimmer placeholder. Card-shaped skeletons mount while a dossier fetches. */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-white/[0.07]", className)}
      {...props}
    />
  );
}
