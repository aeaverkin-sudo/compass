import type { Metadata } from "next";
import Link from "next/link";
import { ScreenHeader } from "@/shared/components/screen-header";
import { createServerSupabaseClient } from "@/shared/lib/supabase/server";
import { COLUMN_GAP_PX } from "@/shared/layout/axes";
import { loadEventInvite } from "@/shared/services/event-invite";
import { loadGoingPeople } from "@/shared/services/event-going";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ code: string }> };

export const metadata: Metadata = { title: "Going" };

/** Those going who allow connections. Only someone on the event sees it. */
export default async function EventGoingPage({ params }: PageProps) {
  const { code } = await params;
  let lookup = code.trim();
  try {
    lookup = decodeURIComponent(lookup);
  } catch {
    // A broken escape stays as written.
  }
  const invitePath = `/e/${encodeURIComponent(lookup)}`;
  const event = await loadEventInvite(code);
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const people = event ? await loadGoingPeople(event.id, data.user?.id ?? null) : null;
  const back = `${invitePath}/going`;
  const self = people?.some((person) => person.self) ?? false;

  return (
    <main className="compass-main fixed inset-0 overflow-y-auto bg-white text-[var(--ink)]">
      <ScreenHeader title="Going" fallbackHref={invitePath} />
      <div className="px-[var(--gutter)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {!people ? (
          <p className="mb-0 t-body text-[var(--grey)]">{event ? "Not available" : "Event not found"}</p>
        ) : (
          <>
            <div className="flex flex-col gap-[18px]">
              {people.map((person) => (
                <Link
                  key={person.token}
                  href={`/scan/card?token=${encodeURIComponent(person.token)}&back=${encodeURIComponent(back)}`}
                  className="press flex w-full min-w-0 items-center no-underline [-webkit-tap-highlight-color:transparent]"
                  style={{ gap: COLUMN_GAP_PX }}
                >
                  {person.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={person.photoUrl} alt="" className="size-[40px] shrink-0 object-cover" />
                  ) : (
                    <span aria-hidden className="size-[40px] shrink-0 bg-[#f3f3f3]" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate t-body text-[var(--ink)]">{person.name}</span>
                    {person.title ? (
                      <span className="mt-1 block truncate t-meta text-[var(--grey)]">{person.title}</span>
                    ) : null}
                  </span>
                </Link>
              ))}
            </div>
            {self ? (
              <p className="mt-6 mb-0 t-meta text-[var(--grey)]">
                You&apos;re on this list too —{" "}
                <Link href="/profile" className="text-[var(--grey)] underline">
                  hide in Profile
                </Link>
                .
              </p>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
