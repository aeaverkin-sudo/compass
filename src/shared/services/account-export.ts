import "server-only";

import { createAdminSupabaseClient } from "@/shared/lib/supabase/admin";
import { sessionUser } from "@/shared/lib/supabase/session-user";
import { downloadAttachmentBytes } from "@/shared/services/attachment-api";
import { runAccountExport, type ExportQuery } from "@/shared/services/account-export-run";

export async function* accountExportParts(ownerId: string): AsyncGenerator<Uint8Array> {
  const admin = createAdminSupabaseClient();
  const user = await sessionUser();
  yield* runAccountExport({
    ownerId,
    user,
    database: {
      from(table: string) {
        return admin.from(table) as unknown as ExportQuery;
      },
    },
    download: downloadAttachmentBytes,
  });
}
