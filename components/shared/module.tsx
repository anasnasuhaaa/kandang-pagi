import type { ReactNode } from "react";
import { Inbox, type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { semanticStyles, type SemanticTone } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export function ModuleHeader({
  title, description, icon: Icon, action,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <header className="min-w-0 rounded-2xl border border-border/80 bg-card px-4 py-5 sm:px-6 sm:py-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-2">
          {Icon && <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon aria-hidden="true" className="size-5" /></span>}
          <h1 className="break-words text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          <p className="max-w-xl text-sm/6 text-muted-foreground">{description}</p>
        </div>
        {action}
      </div>
    </header>
  );
}

export function EmptyState({
  title, description, icon: Icon = Inbox, action,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <Card className="border-dashed bg-card/70 py-0 shadow-none">
      <CardContent className="flex min-h-56 flex-col items-center justify-center gap-3 px-5 py-8 text-center sm:px-8">
        <div className="grid size-12 place-items-center rounded-2xl border bg-muted/60 text-muted-foreground">
          <Icon className="size-5" aria-hidden="true" />
        </div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="max-w-md text-sm/6 text-muted-foreground">{description}</p>
        {action}
      </CardContent>
    </Card>
  );
}

export function MetricCard({ label, value, detail, icon: Icon, tone = "neutral" }: {
  label: string; value: ReactNode; detail?: string; icon?: LucideIcon; tone?: SemanticTone;
}) {
  return <Card className="min-w-0">
    <CardContent>
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon && <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg border", semanticStyles[tone])}>
          <Icon className="size-4" aria-hidden="true" />
        </span>}
        <p className="min-w-0 text-sm font-medium leading-snug text-muted-foreground">{label}</p>
      </div>
      <div className="mt-2 break-words text-xl leading-snug font-semibold tracking-tight tabular-nums sm:text-2xl">{value}</div>
      {detail && <p className="mt-1 text-xs/5 text-muted-foreground">{detail}</p>}
    </CardContent>
  </Card>;
}

export function ModuleSkeleton() {
  return (
    <div role="status" aria-live="polite" className="space-y-5">
      <span className="sr-only">Memuat halaman</span>
      <Skeleton className="h-40 w-full rounded-2xl" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-52 w-full" />
    </div>
  );
}
