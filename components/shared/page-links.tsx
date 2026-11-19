import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export function PageLinks({ current, pages, path, query }: {
  current: number; pages: number; path: string; query: Record<string, string>;
}) {
  function href(page: number) {
    return `${path}?${new URLSearchParams({ ...query, halaman: String(page) })}`;
  }
  return (
    <nav aria-label="Paginasi" className="flex flex-wrap items-center gap-2 text-sm">
      <span className="mr-auto text-muted-foreground">Halaman {current} dari {pages}</span>
      {current > 1 && <Link href={href(current - 1)} className={buttonVariants({ variant: "outline", size: "sm" })} scroll={false}>Sebelumnya</Link>}
      {current < pages && <Link href={href(current + 1)} className={buttonVariants({ variant: "outline", size: "sm" })} scroll={false}>Berikutnya</Link>}
    </nav>
  );
}
