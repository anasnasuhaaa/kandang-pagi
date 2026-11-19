import type { ReactNode } from "react";
import { Inbox, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <header className="relative isolate overflow-hidden rounded-2xl border border-border/80 bg-card p-5 sm:p-8">
      <div className="module-header-glow pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-3">
          {Icon && <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon aria-hidden="true" className="size-5" /></span>}
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

export function MetricCard({ label, value, detail }: { label: string; value: ReactNode; detail?: string }) {
  return (
    <Card className="min-w-0">
      <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle></CardHeader>
      <CardContent>
        <div className="break-words text-2xl font-semibold tabular-nums">{value}</div>
        {detail && <p className="mt-1 text-sm text-muted-foreground">{detail}</p>}
      </CardContent>
    </Card>
  );
}

export function ModuleSkeleton() {
  return (
    <div aria-label="Memuat halaman" aria-busy="true" className="space-y-5">
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
