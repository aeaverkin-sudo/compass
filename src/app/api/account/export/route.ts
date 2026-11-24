import { requireOwnerId } from "@/shared/services/attachment-api";
import { accountExportParts } from "@/shared/services/account-export";
import { streamAccountExport } from "@/shared/services/account-export-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return streamAccountExport(await requireOwnerId(), accountExportParts);
}
