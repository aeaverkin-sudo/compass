import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Zone } from "@/shared/components/zone";
import { COLUMN_GAP_PX } from "@/shared/layout/axes";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { listEventGuests, loadManageEvent } from "@/shared/services/event-manage";
import { CheckMark } from "../check-mark";
import { ManageFrame } from "../manage-frame";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Guests" };

type PageProps = { params: Promise<{ code: string }> };

function once(value: string): string {
  try {
    return decodeURIComponent(value.trim());
  } catch {
    return value.trim();
  }
}

export default async function ManageGuestsPage({ params }: PageProps) {
  const { code } = await params;
  const lookup = once(code);
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) notFound();
  const access = await loadManageEvent(lookup, data.user.id, "guests");
  if (access.kind !== "ok") notFound();
  const list = await listEventGuests(access.event.id);

  return (
    <ManageFrame title="Guests" fallbackHref={`/e/${encodeURIComponent(lookup)}/manage`}>
      <p className="mb-0 t-meta text-[var(--grey)]">
        {`${list.registered} registered · ${list.paid} paid · ${list.checkedIn} checked-in`}
      </p>
      <Zone label="List" align="start">
        <ul>
          {list.guests.map((guest) => (
            <li key={guest.id} className="flex items-center py-[14px]" style={{ gap: COLUMN_GAP_PX }}>
              {guest.photoUrl ? (
                <img src={guest.photoUrl} alt="" className="size-10 shrink-0 object-cover" />
              ) : (
                <span aria-hidden className="size-10 shrink-0 bg-[#f3f3f3]" />
              )}
              <span className="min-w-0">
                <span className="block truncate t-body text-[var(--ink)]">{guest.name}</span>
                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 t-meta">
                  {guest.checkedIn ? (
                    <span className="inline-flex items-center gap-1 text-[var(--ink)]">
                      <CheckMark />
                      Checked-in
                    </span>
                  ) : (
                    <span className="text-[var(--grey)]">Not checked-in</span>
                  )}
                  <span className={guest.paid ? "text-[var(--ink)]" : "text-[var(--grey)]"}>{guest.paid ? "Paid" : "Unpaid"}</span>
                  {guest.connected ? <span className="text-[var(--ink)]">Connected</span> : null}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Zone>
    </ManageFrame>
  );
}
