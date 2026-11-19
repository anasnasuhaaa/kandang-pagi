export const businessTimeZone = "Asia/Jakarta";

const businessDateParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: businessTimeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const localDate = new Intl.DateTimeFormat("id-ID", {
  timeZone: businessTimeZone,
  dateStyle: "long",
});
const idr = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
const quantity = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 });

export function businessDate(at = new Date()) {
  return businessDateParts.format(at);
}

export function formatDate(date: string) {
  return localDate.format(new Date(`${date}T00:00:00+07:00`));
}

export function formatIDR(value: number | bigint) {
  return idr.format(value);
}

export function formatQuantity(value: number | bigint) {
  return quantity.format(value);
}
