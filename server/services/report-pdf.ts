import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { ReportData, ReportSection } from "../../lib/domain/report";
import { businessTimeZone, formatDate } from "../../lib/format";

const width = 842;
const height = 595;
const margin = 38;
const lineHeight = 12;
const ink = rgb(0.12, 0.15, 0.2);
const muted = rgb(0.34, 0.38, 0.44);
const red = rgb(0.75, 0.12, 0.12);
const stripe = rgb(0.96, 0.97, 0.98);

function printable(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e\xa0-\xff\u2013\u2014\u2022]/g, " ").trim();
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number) {
  const result = [];
  let line = "";
  for (const token of printable(text).split(/\s+/)) {
    const sample = line ? `${line} ${token}` : token;
    if (font.widthOfTextAtSize(sample, size) <= maxWidth) {
      line = sample;
      continue;
    }
    if (line) result.push(line);
    line = "";
    for (const char of token) {
      if (line && font.widthOfTextAtSize(line + char, size) > maxWidth) {
        result.push(line);
        line = "";
      }
      line += char;
    }
  }
  if (line || !result.length) result.push(line || "-");
  return result;
}

type PdfReport = Omit<ReportData, "sections"> & { sections: Pick<ReportSection, "title" | "columns" | "rows">[] };

export async function renderReportPdf(report: PdfReport) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const period = `${formatDate(report.from)} - ${formatDate(report.to)} (WIB)`;
  const timestamp = new Intl.DateTimeFormat("id-ID", { timeZone: businessTimeZone, dateStyle: "long", timeStyle: "short" }).format(report.generatedAt);
  pdf.setTitle(`Kandang Pagi - ${report.title}`);
  pdf.setAuthor("Kandang Pagi");
  pdf.setLanguage("id-ID");
  pdf.setSubject(period);
  pdf.setCreationDate(report.generatedAt);

  let y = 0;
  const room = width - margin * 2;
  function formatPage(page: PDFPage) {
    page.drawRectangle({ x: 0, y: height - 6, width, height: 6, color: red });
    page.drawText("KANDANG PAGI", { x: margin, y: height - 31, font: bold, size: 10, color: red });
    page.drawText(printable(report.title), { x: margin, y: height - 58, font: bold, size: 21, color: ink });
    page.drawText(printable(period), { x: margin, y: height - 78, font, size: 11, color: muted });
    page.drawText(printable(`Dibuat ${timestamp} WIB`), { x: width - 250, y: height - 33, font, size: 10, color: muted });
    y = height - 103;
    return page;
  }
  let page = formatPage(pdf.addPage([width, height]));
  function newPage() {
    page = formatPage(pdf.addPage([width, height]));
  }
  function ensure(space: number) {
    if (y - space < margin + 20) newPage();
  }
  function text(value: string, size: number, strong = false) {
    const face = strong ? bold : font;
    const lines = wrap(value, face, size, room);
    ensure(lines.length * lineHeight);
    for (const row of lines) {
      page.drawText(row, { x: margin, y, font: face, size, color: strong ? ink : muted });
      y -= lineHeight;
    }
  }
  for (const filter of report.criteria) text(filter, 10);
  y -= 12;
  text("Ringkasan", 13, true);
  for (const metric of report.metrics) text(`${metric.label}: ${metric.value}${metric.detail ? ` (${metric.detail})` : ""}`, 11);
  y -= 13;

  for (const section of report.sections) {
    const columnWidth = room / section.columns.length;
    function heading(continuation = false) {
      text(section.title + (continuation ? " (lanjutan)" : ""), 13, true);
      page.drawRectangle({ x: margin, y: y - 14, width: room, height: 23, color: stripe });
      section.columns.forEach((label, index) => {
        for (const [line, value] of wrap(label, bold, 9, columnWidth - 12).slice(0, 2).entries()) {
          page.drawText(value, { x: margin + index * columnWidth + 6, y: y - line * 10, font: bold, size: 9, color: ink });
        }
      });
      y -= 24;
    }
    ensure(64);
    heading();
    if (!section.rows.length) text("Belum ada catatan pada cakupan ini.", 10);
    for (const cells of section.rows) {
      const wrapped = cells.map((cell) => wrap(cell, font, 9, columnWidth - 12));
      const rowHeight = Math.max(...wrapped.map((cell) => cell.length), 1) * lineHeight + 8;
      if (y - rowHeight < margin + 20) {
        newPage();
        heading(true);
      }
      for (const [column, lines] of wrapped.entries()) {
        for (const [index, value] of lines.entries()) page.drawText(value, {
          x: margin + column * columnWidth + 6, y: y - lineHeight * index, font, size: 9, color: ink,
        });
      }
      y -= rowHeight;
      page.drawLine({ start: { x: margin, y: y + 4 }, end: { x: width - margin, y: y + 4 }, color: stripe, thickness: 1 });
    }
    y -= 13;
  }
  ensure(46);
  text("Catatan", 13, true);
  for (const note of report.notes) { text(note, 10); y -= 4; }
  const pages = pdf.getPages();
  pages.forEach((item, index) => item.drawText(`Halaman ${index + 1} / ${pages.length}`, { x: width - margin - 82, y: 25, font, size: 9, color: muted }));
  return pdf.save();
}
