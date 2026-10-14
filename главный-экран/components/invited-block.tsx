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

export type InboxDeclined = { token: string; key: string; name: string; day: string | null };

/** `{Event} · Not going · {date} · Change`, grey, until the event ends. Change goes back to going. */
export function DeclinedRow({
  entry,
  onGoing,
  onError,
}: {
  entry: InboxDeclined;
  onGoing: (entry: InboxDeclined, next: string | null) => void;
  onError: (text: string) => void;
}) {
  const { busy, run } = useBusyAction<"change">();
  const change = () =>
    run("change", async () => {
      const reply = await acceptInvite(entry.key, entry.token);
      if (!reply.ok) return onError(reply.error);
      onGoing(entry, reply.next);
    });
  return (
    <li className="py-[14px] t-body text-[var(--grey)]">
      {[entry.name, "Not going", entry.day].filter(Boolean).join(" · ")}
      {" · "}
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void change()}
        className="press border-0 bg-transparent p-0 t-body text-[var(--grey)] [-webkit-tap-highlight-color:transparent]"
      >
        Change
      </button>
    </li>
  );
}

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
/** Not going, by the personal token or, without one, the member's own registration. */
export async function declineInvite(key: string, token: string | null): Promise<boolean> {
  try {
    const response = await fetch(`/api/events/${key}/decline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** I'm going on a personal token. The reply's next stop, or an error line. */
export async function acceptInvite(key: string, token: string): Promise<{ ok: true; next: string | null } | { ok: false; error: string }> {
  try {
    const response = await fetch(`/api/events/${key}/guest-accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, timeZone: deviceTimeZone() }),
    });
    const reply = (await response.json()) as { kind?: string; next?: string; error?: string };
    if (!response.ok) return { ok: false, error: reply.error ?? "Could not save that." };
    return { ok: true, next: reply.kind === "go" && reply.next ? reply.next : null };
  } catch {
    return { ok: false, error: "Could not save that." };
  }
}

export function InvitedBlock({
  invites,
  onGoing,
  onDeclined,
  onError,
}: {
  invites: InboxInvite[];
  onGoing: (invite: InboxInvite, next: string | null) => void;
  onDeclined: (invite: InboxInvite) => void;
  onError: (text: string) => void;
}) {
  const { busy, run } = useBusyAction<string>();

  const going = (invite: InboxInvite) =>
    run(`go:${invite.token}`, async () => {
      const reply = await acceptInvite(invite.key, invite.token);
      if (!reply.ok) return onError(reply.error);
      onGoing(invite, reply.next);
    });

  const notGoing = (invite: InboxInvite) =>
    run(`no:${invite.token}`, async () => {
      if (!(await declineInvite(invite.key, invite.token))) return onError("Could not save that.");
      onDeclined(invite);
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
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void notGoing(invite)}
                    className="press border-0 bg-transparent p-0 t-caps text-[var(--grey)] [-webkit-tap-highlight-color:transparent]"
                  >
                    Not going
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
