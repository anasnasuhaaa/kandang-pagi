import type { Metadata } from "next";
import { LayoutDashboard } from "lucide-react";
import { headers } from "next/headers";
import { Suspense } from "react";
import { PopulationFilters } from "@/components/population/filters";
import { EmptyState, MetricCard, ModuleHeader, ModuleSkeleton } from "@/components/shared/module";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { populationPeriod } from "@/lib/domain/population-input";
import { businessDate, formatDate, formatQuantity } from "@/lib/format";
import { requireModule } from "@/server/auth/workspace";
import { populationDashboard } from "@/server/services/population";

export const metadata: Metadata = { title: "Dashboard" };
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function Page(props: Props) {
  return <Suspense fallback={<ModuleSkeleton />}><DashboardContent {...props} /></Suspense>;
}

function percent(value: number | null) {
  return value === null ? "Data belum lengkap" : `${formatQuantity(Math.round(value * 100) / 100)}%`;
}

async function DashboardContent({ searchParams }: Props) {
  await requireModule("dashboard");
  const period = populationPeriod(await searchParams);
  const { timeline, rates, barnRows, flockRows } = await populationDashboard(await headers(), period);
  const last = timeline[timeline.length - 1];
  const knownDays = timeline.filter(({ known }) => known);
  const max = Math.max(1, ...knownDays.map(({ hens }) => hens));
  const casualties = knownDays.reduce((total, day) => total + day.deaths, 0);
  return (
    <>
      <ModuleHeader title="Dashboard" description="Pantau populasi dan catatan operasional pada periode yang dipilih." icon={LayoutDashboard} />
      <Card>
        <CardContent>
          <PopulationFilters key={period.from + period.to + period.barnId + period.flockId}
            path="/dashboard" from={period.from} to={period.to} barnId={period.barnId} flockId={period.flockId}
            barns={barnRows.map(({ id, label }) => ({ value: id, label }))}
            flocks={flockRows.map(({ id, label }) => ({ value: id, label }))}
            today={businessDate()} />
        </CardContent>
      </Card>
      <section aria-label="Ringkasan operasional" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Populasi akhir hari" value={last.known ? `${formatQuantity(last.hens)} ekor` : "Belum ada data"} detail={formatDate(last.day)} />
        <MetricCard label="Kelompok aktif" value={last.known ? formatQuantity(last.activeFlocks) : "Belum ada data"} detail={formatDate(last.day)} />
        <MetricCard label="Kematian tercatat" value={knownDays.length ? `${formatQuantity(casualties)} ekor` : "Belum ada data"} detail="Dalam periode terpilih" />
        <MetricCard label="Hari dengan pencatatan panen" value={`${rates.measuredDays} / ${timeline.length}`} detail={rates.measuredDays === timeline.length ? "Periode tercatat" : "Data belum lengkap"} />
      </section>
      {knownDays.length ? (
        <Card>
          <CardHeader><CardTitle><h2>Tren populasi</h2></CardTitle><CardDescription>Jumlah ternak hidup pada akhir setiap hari.</CardDescription></CardHeader>
          <CardContent>
            <figure className="space-y-3">
              <div className="flex h-36 items-end gap-px rounded-lg border-b px-1 sm:gap-1" role="img" aria-label={`Tren populasi dari ${formatDate(period.from)} hingga ${formatDate(period.to)}. Populasi terakhir ${formatQuantity(last.hens)} ekor.`}>
                {timeline.map((day) => (
                  <div key={day.day} className="flex h-full min-w-0 flex-1 items-end justify-center" title={`${formatDate(day.day)} · ${day.known ? `${formatQuantity(day.hens)} ekor` : "Data belum lengkap"}`}>
                    {day.known && <div className="min-h-0.5 w-full max-w-16 rounded-t bg-chart-1" style={{ height: `${day.hens / max * 100}%` }} />}
                  </div>
                ))}
              </div>
              <figcaption className="flex justify-between gap-2 text-xs text-muted-foreground"><span>{formatDate(period.from)}</span><span>{formatDate(period.to)}</span></figcaption>
            </figure>
          </CardContent>
        </Card>
      ) : <EmptyState title="Belum ada riwayat populasi" description="Tren akan muncul setelah penempatan kelompok tercatat pada periode ini." />}
      <section aria-label="Produksi dan pakan" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="HDP" value={percent(rates.hdp)} detail="Berdasarkan populasi akhir hari" />
        <MetricCard label="HHP" value={period.flockId ? percent(rates.hhp) : "Pilih kelompok"} detail="Berdasarkan jumlah penempatan awal" />
        <MetricCard label="Panen telur" value={timeline.some(({ recorded }) => recorded) ? `${formatQuantity(timeline.reduce((total, day) => total + day.eggs, 0))} butir` : "Data belum lengkap"} detail="Catatan panen pada periode ini" />
        <MetricCard label="Konsumsi pakan dan FCR" value="Data belum lengkap" detail="Menunggu pencatatan pakan dan berat panen" />
      </section>
    </>
  );
}
