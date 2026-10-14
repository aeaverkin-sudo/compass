"use client";

import Link from "next/link";
import { useBusyAction } from "@/shared/hooks/use-busy-action";

export type InboxInvite = {
  token: string;
  key: string;
  name: string;
  when: string | null;
  place: string | null;
  organiser: string | null;
  posterSrc: string;
  startsAt: string | null;
};

export type InboxDeclined = { token: string; key: string; name: string; day: string | null; startsAt: string | null };

/** An invitation with no answer: a row of Upcoming with the sky New plaque. The tap opens the poster with I'm going. */
export function InviteRow({ invite }: { invite: InboxInvite }) {
  return (
    <li>
      <Link
        href={`/e/${invite.key}?g=${encodeURIComponent(invite.token)}`}
        className="press block w-full py-[14px] text-left no-underline [-webkit-tap-highlight-color:transparent]"
      >
        <span className="flex items-center gap-2 t-body text-[var(--ink)]">
          <span className="min-w-0 truncate">{invite.name}</span>
          <span className="shrink-0 bg-sky px-1.5 py-0.5 t-caps text-[var(--ink)]">New</span>
        </span>
        {invite.when || invite.place ? (
          <span className="mt-1 block t-meta text-[var(--grey)]">{[invite.when, invite.place].filter(Boolean).join(" · ")}</span>
        ) : null}
        {invite.organiser ? <span className="mt-1 block t-meta text-[var(--grey)]">{`Invited by ${invite.organiser}`}</span> : null}
      </Link>
    </li>
  );
}

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

function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
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
