import type { Metadata } from "next";
import { ChartNoAxesCombined, Download } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";
import { ReportFilters } from "@/components/reports/report-filters";
import { ReportTable } from "@/components/reports/report-table";
import { EmptyState, MetricCard, ModuleHeader, ModuleSkeleton } from "@/components/shared/module";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { reportQuerySchema } from "@/lib/domain/report";
import { businessTimeZone, formatDate } from "@/lib/format";
import { requireModule } from "@/server/auth/workspace";
import { ServiceError } from "@/server/services/errors";
import { reportData, reportFilters } from "@/server/services/reports";

export const metadata: Metadata = { title: "Laporan" };
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const formatter = new Intl.DateTimeFormat("id-ID", { timeZone: businessTimeZone, dateStyle: "medium", timeStyle: "short" });

export default function Page(props: Props) {
  return <Suspense fallback={<ModuleSkeleton />}><ReportsContent {...props} /></Suspense>;
}

async function ReportsContent({ searchParams }: Props) {
  await requireModule("laporan");
  const raw = await searchParams;
  const context = await headers();
  const options = await reportFilters(context);
  let report;
  try {
    report = await reportData(context, raw);
  } catch (error) {
    if (!(error instanceof ServiceError)) throw error;
    return <>
      <ModuleHeader title="Laporan" description="Pilih cakupan dan periode laporan." icon={ChartNoAxesCombined} />
      <EmptyState title="Laporan tidak dapat dibuka" description={error.message}
        action={<Link href="/laporan" className={buttonVariants()}>Kembali ke laporan</Link>} />
    </>;
  }

  const selected = reportQuerySchema.parse(raw);
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...selected, jenis: report.family, mulai: report.from, akhir: report.to })) {
    if (value) query.set(key, value);
  }
  const download = `/api/laporan/pdf?${query}`;
  return <>
    <ModuleHeader title="Laporan" description="Tinjau ringkasan historis dan unduh rincian dengan cakupan yang sama." icon={ChartNoAxesCombined}
      action={<Link href={download} prefetch={false} className={buttonVariants({ size: "lg" })}><Download aria-hidden="true" /> Unduh PDF</Link>} />
    <Card><CardContent>
      <ReportFilters key={query.toString()} selected={{ ...selected, jenis: report.family }} options={options} from={report.from} to={report.to} />
    </CardContent></Card>
    <section aria-label="Cakupan laporan" className="space-y-1">
      <h2 className="text-lg font-semibold">{report.title}</h2>
      <p className="text-sm text-muted-foreground">{formatDate(report.from)} – {formatDate(report.to)} · Dibuat {formatter.format(report.generatedAt)} WIB</p>
    </section>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Ringkasan laporan">
      {report.metrics.map(({ label, value, detail }) => <MetricCard key={label} label={label} value={value} detail={detail} />)}
    </section>
    {report.sections.map((section) => <ReportTable key={`${query}:${section.title}`} section={section} />)}
    <Card><CardContent>
      <h2 className="mb-2 font-semibold">Catatan laporan</h2>
      <ul className="list-disc space-y-1 pl-5 text-sm/6 text-muted-foreground">{report.notes.map((note) => <li key={note}>{note}</li>)}</ul>
    </CardContent></Card>
  </>;
}
