import type { Metadata } from "next";
import { ArrowLeftRight, Bird, Boxes, CalendarCheck, ChartNoAxesCombined, CircleMinus, Egg, House, LayoutDashboard, Scale, Syringe, TriangleAlert, Users, Wallet, Warehouse } from "lucide-react";
import { headers } from "next/headers";
import { Suspense } from "react";
import { PopulationFilters } from "@/components/population/filters";
import { EmptyState, MetricCard, ModuleHeader, ModuleSkeleton } from "@/components/shared/module";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { categoryLabels, sortedCategories } from "@/lib/domain/production-input";
import { populationPeriod } from "@/lib/domain/population-input";
import { businessDate, formatDate, formatIDR, formatQuantity } from "@/lib/format";
import { requireModule } from "@/server/auth/workspace";
import { financeSummary } from "@/server/services/finance";
import { overdueVaccines } from "@/server/services/health";
import { productionSummary } from "@/server/services/production-summary";
import { populationDashboard } from "@/server/services/population";

export const metadata: Metadata = { title: "Dashboard" };
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function Page(props: Props) {
  return <Suspense fallback={<ModuleSkeleton />}><DashboardContent {...props} /></Suspense>;
}

function percent(value: number | null) {
  return value === null ? "Data belum lengkap" : `${formatQuantity(Math.round(value * 100) / 100)}%`;
}

function weight(grams: number | null) {
  return grams === null ? "Data belum lengkap" : `${formatQuantity(grams / 1000)} kg`;
}

async function DashboardContent({ searchParams }: Props) {
  const actor = await requireModule("dashboard");
  const period = populationPeriod(await searchParams);
  const context = await headers();
  const [{ timeline, rates, barnRows, flockRows }, production, vaccines, cash] = await Promise.all([
    populationDashboard(context, period), productionSummary(context, period),
    overdueVaccines(context, period.to, undefined, period.barnId, period.flockId),
    !period.barnId && !period.flockId && actor.role !== "abk" ? financeSummary(context, period) : null,
  ]);
  const last = timeline[timeline.length - 1];
  const knownDays = timeline.filter(({ known }) => known);
  const max = Math.max(1, ...knownDays.map(({ hens }) => hens));
  const lastKnown = knownDays.at(-1);
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
        <MetricCard icon={Bird} label="Populasi akhir hari" value={last.known ? `${formatQuantity(last.hens)} ekor` : "Belum ada data"} detail={formatDate(last.day)} />
        <MetricCard icon={Users} label="Kelompok aktif" value={last.known ? formatQuantity(last.activeFlocks) : "Belum ada data"} detail={formatDate(last.day)} />
        <MetricCard icon={CircleMinus} label="Kematian tercatat" value={knownDays.length ? `${formatQuantity(casualties)} ekor` : "Belum ada data"} detail="Dalam periode terpilih" />
        <MetricCard icon={CalendarCheck} label="Hari dengan pencatatan panen" value={`${rates.measuredDays} / ${timeline.length}`} detail={rates.measuredDays === timeline.length ? "Periode tercatat" : "Data belum lengkap"} />
      </section>
      {knownDays.length ? (
        <Card>
          <CardHeader><CardTitle><h2>Tren populasi</h2></CardTitle><CardDescription>Jumlah ternak hidup pada akhir setiap hari.</CardDescription></CardHeader>
          <CardContent>
            <figure className="space-y-3">
              <div className="flex h-36 items-end gap-px rounded-lg border-b px-1 sm:gap-1" role="img" aria-label={`Tren populasi dari ${formatDate(period.from)} hingga ${formatDate(period.to)}. Catatan terakhir ${lastKnown ? `${formatDate(lastKnown.day)}, ${formatQuantity(lastKnown.hens)} ekor` : "belum tersedia"}.`}>
                {timeline.map((day) => (
                  <div key={day.day} className="flex h-full min-w-0 flex-1 items-end justify-center" title={`${formatDate(day.day)} · ${day.known ? `${formatQuantity(day.hens)} ekor` : "Data belum lengkap"}`}>
                    {day.known && <div className="min-h-0.5 w-full max-w-16 rounded-t bg-info-fg/75" style={{ height: `${day.hens / max * 100}%` }} />}
                  </div>
                ))}
              </div>
              <figcaption className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{formatDate(period.from)}</span><span>Skala 0–{formatQuantity(max)} ekor</span><span>{formatDate(period.to)}</span>
              </figcaption>
            </figure>
          </CardContent>
        </Card>
      ) : <EmptyState title="Belum ada riwayat populasi" description="Tren akan muncul setelah penempatan kelompok tercatat pada periode ini." />}
      <section aria-label="Produksi dan pakan" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={ChartNoAxesCombined} label="HDP" value={percent(rates.hdp)} detail="Berdasarkan populasi akhir hari" />
        <MetricCard icon={ChartNoAxesCombined} label="HHP" value={period.flockId ? percent(rates.hhp) : "Pilih kelompok"} detail="Berdasarkan jumlah penempatan awal" />
        <MetricCard icon={Egg} label="Panen telur" value={timeline.some(({ recorded }) => recorded) ? `${formatQuantity(timeline.reduce((total, day) => total + day.eggs, 0))} butir` : "Data belum lengkap"} detail="Catatan panen pada periode ini" />
        <MetricCard icon={Scale} label="Berat panen" value={weight(production.eggGrams)} detail="Timbangan aktual termasuk telur cacat" />
        <MetricCard icon={Boxes} label="Pakan dikonsumsi" value={weight(production.feedGrams)} detail={period.flockId ? "Pengukuran tersedia per kandang" : `${production.completedDays} dari ${production.expectedDays} hari memiliki pengukuran lengkap`} />
        <MetricCard icon={ChartNoAxesCombined} label="FCR" value={production.fcr === null ? "Data belum lengkap" : formatQuantity(production.fcr)} detail="Kg pakan per kg telur" />
        {!period.barnId && !period.flockId && <>
          <MetricCard icon={Warehouse} label="Stok pakan gudang" value={weight(production.warehouseGrams)} detail={formatDate(period.to)} />
          <MetricCard icon={Egg} label="Stok telur tersortir" value={formatQuantity(sortedCategories.reduce((sum, category) => sum + production.eggStock[category], 0))}
            detail={sortedCategories.map((category) => `${categoryLabels[category]} ${formatQuantity(production.eggStock[category])}`).join(" · ")} />
        </>}
        {!period.flockId && <MetricCard icon={House} label="Sisa pakan di kandang" value={weight(production.barnGrams)} detail={formatDate(period.to)} />}
      </section>
      <section aria-label="Kesehatan dan kas" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={TriangleAlert} tone={vaccines.overdue > 0 ? "danger" : "neutral"} label="Vaksin terlambat" value={vaccines.overdue} detail={formatDate(period.to)} />
        <MetricCard icon={Syringe} tone="info" label="Vaksin dijadwalkan" value={vaccines.due} detail="Hari ini dan mendatang" />
        {cash && <>
          <MetricCard icon={Wallet} label="Saldo kas farm" value={cash.count ? formatIDR(cash.balance) : "Belum ada catatan"} detail={formatDate(period.to)} />
          <MetricCard icon={ArrowLeftRight} label="Arus kas bersih" value={formatIDR(cash.net)} detail={`Masuk ${formatIDR(cash.income)} · Keluar ${formatIDR(cash.expense)}`} />
        </>}
      </section>
    </>
  );
}
