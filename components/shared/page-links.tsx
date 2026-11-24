import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { tableHref } from "@/lib/domain/table-sort";

type Navigation = { current: number; pages: number; total: number };
type Destination = { path: string; query: Record<string, string> } | { onPage: (page: number) => void };

export function PageLinks({ current, pages, total, ...destination }: Navigation & Destination) {
  return (
    <nav aria-label="Paginasi" className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
      <span aria-live="polite" className="mr-auto text-muted-foreground">
        {total.toLocaleString("id-ID")} hasil{pages > 1 && ` · Halaman ${current} dari ${pages}`}
      </span>
      {pages > 1 && (["previous", "next"] as const).map((direction) => {
        const previous = direction === "previous";
        const page = previous ? current - 1 : current + 1;
        const label = previous ? "Sebelumnya" : "Berikutnya";
        const Icon = previous ? ChevronLeft : ChevronRight;
        const disabled = page < 1 || page > pages;
        const content = <><Icon aria-hidden="true" /><span className="hidden sm:inline">{label}</span></>;
        return !disabled && "path" in destination
          ? <Link key={direction} href={tableHref(destination.path, { ...destination.query, halaman: String(page) })}
              aria-label={label} className={buttonVariants({ variant: "outline", size: "sm", className: "min-h-10 min-w-10" })} scroll={false}>{content}</Link>
          : <Button key={direction} type="button" variant="outline" size="sm" className="min-h-10 min-w-10"
              aria-label={label} disabled={disabled} onClick={"onPage" in destination ? () => destination.onPage(page) : undefined}>{content}</Button>;
      })}
    </nav>
  );
}
