import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fieldsFromEvent } from "@/shared/event/event-form-fields";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { loadEventInvite } from "@/shared/services/event-invite";
import { loadManageEvent } from "@/shared/services/event-manage";
import { EditScreen } from "./edit-screen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Edit" };

type PageProps = { params: Promise<{ code: string }> };

function once(value: string): string {
  try {
    return decodeURIComponent(value.trim());
  } catch {
    return value.trim();
  }
}

export default async function ManageEditPage({ params }: PageProps) {
  const { code } = await params;
  const lookup = once(code);
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) notFound();
  const access = await loadManageEvent(lookup, data.user.id, "edit");
  if (access.kind !== "ok") notFound();
  const invite = await loadEventInvite(lookup);
  if (!invite) notFound();

  return (
    <EditScreen
      lookup={lookup}
      initial={fieldsFromEvent(invite)}
      logoUrl={invite.logoAttachmentId ? `/e/${invite.publicToken}/logo` : null}
      isOwner={access.event.role === "owner"}
    />
  );
}
