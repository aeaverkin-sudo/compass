"use client";

import Link from "next/link";
import { useBusyAction } from "@/shared/hooks/use-busy-action";
import { COLUMN_GAP_PX, LABEL_COLUMN_PX } from "@/shared/layout/axes";

export type InboxInvite = {
  token: string;
  key: string;
  name: string;
  when: string | null;
  place: string | null;
  organiser: string | null;
  posterSrc: string;
};

const SKY =
  "press inline-block border-0 bg-sky px-[21.6px] py-[10.8px] text-center t-caps text-[var(--ink)] no-underline disabled:text-[var(--grey)] [-webkit-tap-highlight-color:transparent]";

function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

/**
 * Invitations to this account with no answer. I'm going joins with the primary card.
 * The reply's next stop is Events itself: the list reloads and the toast says so.
 */
export function InvitedBlock({
  invites,
  onGoing,
  onError,
}: {
  invites: InboxInvite[];
  onGoing: (invite: InboxInvite, next: string | null) => void;
  onError: (text: string) => void;
}) {
  const { busy, run } = useBusyAction<string>();

  const going = (invite: InboxInvite) =>
    run(`go:${invite.token}`, async () => {
      try {
        const response = await fetch(`/api/events/${invite.key}/guest-accept`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: invite.token, timeZone: deviceTimeZone() }),
        });
        const reply = (await response.json()) as { kind?: string; next?: string; error?: string };
        if (!response.ok) return onError(reply.error ?? "Could not save that.");
        onGoing(invite, reply.kind === "go" && reply.next ? reply.next : null);
      } catch {
        onError("Could not save that.");
      }
    });

  return (
    <section>
      <div
        className="grid items-start"
        style={{ gridTemplateColumns: `${LABEL_COLUMN_PX}px minmax(0, 1fr)`, columnGap: COLUMN_GAP_PX }}
      >
        <span className="t-label pt-[14px]">Invited</span>
        <ul>
          {invites.map((invite) => {
            const poster = `/e/${invite.key}?g=${encodeURIComponent(invite.token)}`;
            return (
              <li key={invite.token} className="py-[14px]">
                <Link href={poster} className="press block no-underline [-webkit-tap-highlight-color:transparent]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={invite.posterSrc} alt="" className="block h-auto w-[96px]" />
                  <span className="mt-3 block t-body text-[var(--ink)]">{invite.name}</span>
                </Link>
                {invite.when || invite.place ? (
                  <span className="mt-1 block t-meta text-[var(--grey)]">
                    {[invite.when, invite.place].filter(Boolean).join(" · ")}
                  </span>
                ) : null}
                {invite.organiser ? (
                  <span className="mt-1 block t-meta text-[var(--grey)]">{`Invited by ${invite.organiser}`}</span>
                ) : null}
                <div className="mt-3 flex items-center gap-5">
                  <button type="button" disabled={busy !== null} onClick={() => void going(invite)} className={SKY}>
                    I&apos;m going *
                  </button>
                </div>
                <p className="mt-3 mb-0 t-meta text-[var(--grey)]">* I agree to the event rules, Terms and Privacy.</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
