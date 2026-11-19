import { database } from "../../db";
import { feedConversion } from "../../lib/domain/inventory";
import { requireRole } from "../auth/permissions";
import { eggProjection } from "./eggs";
import { farmReaders } from "./farm";
import { feedConsumedForBarns, feedProjection } from "./feed";
import { populationPeriodData } from "./population";

type Period = Parameters<typeof populationPeriodData>[1];

export async function productionSummary(headers: Headers, period: Period, db = database()) {
  await requireRole(headers, farmReaders, db);
  const [forecast, feed, egg] = await Promise.all([
    populationPeriodData(db, period),
    feedProjection(db, period.to, undefined, period.from),
    eggProjection(db, period.to),
  ]);
  const eligible = forecast.timeline.filter(({ activeBarnIds, recorded }) => activeBarnIds.length || recorded);
  const daily = eligible.map((day) => ({
    ...day,
    consumedGrams: period.flockId ? null : feedConsumedForBarns(feed, day.day, day.activeBarnIds),
  }));
  const total = (values: (number | null)[]) => values.length && values.every((value) => value !== null)
    ? values.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null;
  const feedGrams = total(daily.map(({ consumedGrams }) => consumedGrams));
  const eggGrams = total(daily.map(({ measuredGrams, mixed }) => period.flockId && mixed ? null : measuredGrams));
  const current = [...feed.balances.values()];
  const barnStocks = current.filter(({ barnId }) => barnId && (!period.barnId || period.barnId === barnId));
  return {
    feedGrams, eggGrams, fcr: feedConversion(feedGrams, eggGrams),
    warehouseGrams: current.filter(({ barnId }) => barnId === null).reduce((sum, row) => sum + row.grams, 0),
    barnGrams: barnStocks.length && !barnStocks.some((row) => row.grams > 0 && row.closedOn !== period.to)
      ? barnStocks.reduce((sum, row) => sum + row.grams, 0) : null,
    completedDays: daily.filter(({ consumedGrams }) => consumedGrams !== null).length,
    expectedDays: daily.length,
    eggStock: egg.balances,
  };
}
