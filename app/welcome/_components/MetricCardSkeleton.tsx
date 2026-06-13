import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Card-shaped placeholder shown while the dossier fetches. */
export function MetricCardSkeleton() {
  return (
    <Card className="gap-3 p-4">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-7 w-28" />
      <Skeleton className="h-5 w-24 rounded-full" />
    </Card>
  );
}
