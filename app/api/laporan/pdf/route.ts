import { NextResponse } from "next/server";
import { ServiceError, safeError } from "@/server/services/errors";
import { renderReportPdf } from "@/server/services/report-pdf";
import { reportData } from "@/server/services/reports";

const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request) {
  try {
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const report = await reportData(request.headers, query);
    const bytes = await renderReportPdf(report);
    return new Response(new Uint8Array(bytes), {
      headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="laporan-${report.family}-${report.to}.pdf"` },
    });
  } catch (error) {
    const code = error instanceof ServiceError ? error.code : undefined;
    const status = code === "unauthenticated" ? 401 : code === "forbidden" ? 403 : code === "not-found" ? 404 : code === "invalid" ? 400 : 500;
    return NextResponse.json({ message: safeError(error) }, { status, headers });
  }
}
