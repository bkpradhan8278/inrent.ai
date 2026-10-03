import { exportOrganizationData, ServiceError, type ExportFormat, type ExportKind } from "@inrent/services";
import { getWorkspaceForRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

const KINDS: ExportKind[] = ["usage", "requests", "billing", "invoices"];
const FORMATS: ExportFormat[] = ["csv", "json"];

/** Downloads organization data (usage, requests, ledger, invoices) as CSV or JSON. */
export async function GET(req: Request) {
  const ws = await getWorkspaceForRequest(req);
  if (!ws) return Response.json({ error: { code: "not_signed_in", message: "Sign in to export data." } }, { status: 401 });
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") as ExportKind;
  const format = (url.searchParams.get("format") ?? "csv") as ExportFormat;
  if (!KINDS.includes(kind) || !FORMATS.includes(format)) return Response.json({ error: { code: "invalid_request", message: "Unknown export kind or format." } }, { status: 400 });
  try {
    const file = await exportOrganizationData(ws.user.id, ws.org.id, kind, format);
    return new Response(file.body, {
      headers: { "content-type": file.contentType, "content-disposition": `attachment; filename="${file.filename}"`, "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
  } catch (e) {
    if (e instanceof ServiceError) return Response.json({ error: { code: e.code, message: e.message } }, { status: e.status });
    throw e;
  }
}
