"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Rule } from "@/shared/components/rule";
import { ScreenHeader } from "@/shared/components/screen-header";
import { Zone } from "@/shared/components/zone";
import { CoverButton } from "@/shared/event/cover-button";
import type { InviteCoverEvent } from "@/shared/event/invite-cover";
import type { TeamRoleName } from "@/shared/event/permissions";
import type { EventLayoutId, EventThemeId } from "@/shared/event/themes";

const PRIMARY =
  "press inline-block border-0 bg-sky px-6 py-3 t-caps text-[var(--ink)] no-underline shadow-none disabled:text-[var(--grey)] [-webkit-tap-highlight-color:transparent]";

type AcceptResult = { ok: true } | { ok: false; error: string };

const flights = new Map<string, Promise<AcceptResult>>();

function requestAccept(lookup: string, token: string): Promise<AcceptResult> {
  const key = `${lookup}\n${token}`;
  const current = flights.get(key);
  if (current) return current;
  const flight = (async (): Promise<AcceptResult> => {
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(lookup)}/managers/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) return { ok: false, error: body.error ?? "Could not accept." };
      return { ok: true };
    } catch {
      return { ok: false, error: "Could not accept." };
    }
  })();
  flights.set(key, flight);
  void flight.then((result) => {
    if (!result.ok) flights.delete(key);
  });
  return flight;
}

export function AcceptScreen({
  lookup,
  token,
  ownerName,
  eventName,
  role,
  roleDetail,
  when,
  where,
  layout,
  themeId,
  cover,
  signInHref,
  signUpHref,
  anonymous = false,
  autoAccept = false,
}: {
  lookup: string;
  token: string;
  ownerName: string;
  eventName: string;
  role: TeamRoleName;
  roleDetail: string;
  when: string | null;
  where: string | null;
  layout: EventLayoutId;
  themeId: EventThemeId;
  cover: InviteCoverEvent;
  /** Set when the viewer still has to sign in. Accept then continues on this invite. */
  signInHref?: string;
  signUpHref?: string;
  /** A trial session is not an account. Accept stays closed. */
  anonymous?: boolean;
  /** Returned from sign-in or sign-up. Accept runs once, without a second tap. */
  autoAccept?: boolean;
}) {
  const router = useRouter();
  const signedIn = !signInHref;
  const [busy, setBusy] = useState(autoAccept && signedIn);
  const [error, setError] = useState<string | null>(null);

  const finish = useCallback(
    (result: AcceptResult) => {
      if (result.ok) {
        router.push(`/e/${encodeURIComponent(lookup)}/manage`);
        router.refresh();
        return;
      }
      setError(result.error);
      setBusy(false);
    },
    [lookup, router],
  );

  useEffect(() => {
    if (!autoAccept || !signedIn) return;
    let alive = true;
    void requestAccept(lookup, token).then((result) => {
      if (alive) finish(result);
    });
    return () => {
      alive = false;
    };
  }, [autoAccept, signedIn, lookup, token, finish]);

  const accept = () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    void requestAccept(lookup, token).then(finish);
  };

  return (
    <main className="compass-main min-h-dvh overflow-y-auto bg-white px-[var(--gutter)] pb-[max(2.5rem,env(safe-area-inset-bottom))] text-[var(--ink)]">
      <ScreenHeader title="Team invite" fallbackHref={`/e/${encodeURIComponent(lookup)}`} />
      <Zone label="" align="start">
        <CoverButton variant="card" layout={layout} themeId={themeId} event={cover} />
      </Zone>
      <Rule />
      <Zone label="From" align="start">
        <p className="m-0 t-body text-[var(--ink)]">{ownerName}</p>
        <p className="mt-1 mb-0 t-meta text-[var(--grey)]">{`Invited you to help run ${eventName}.`}</p>
      </Zone>
      <Rule />
      <Zone label="Role" align="start">
        <p className="m-0 t-body text-[var(--ink)]">{role}</p>
        {roleDetail ? <p className="mt-1 mb-0 t-meta text-[var(--grey)]">{roleDetail}</p> : null}
      </Zone>
      {when ? (
        <>
          <Rule />
          <Zone label="When">
            <p className="m-0 t-body text-[var(--ink)]">{when}</p>
          </Zone>
        </>
      ) : null}
      {where ? (
        <>
          <Rule />
          <Zone label="Where">
            <p className="m-0 t-body text-[var(--ink)]">{where}</p>
          </Zone>
        </>
      ) : null}
      <Rule />
      <Zone label="" align="start">
        {anonymous ? (
          <p className="mb-4 t-body text-[var(--ink)]">To join a team, sign in or create an account</p>
        ) : null}
        {error ? <p className="mb-4 t-meta text-[var(--ink)]">{error}</p> : null}
        {signedIn ? (
          <button type="button" disabled={busy} onClick={accept} className={PRIMARY}>
            {busy ? "Accepting…" : "Accept"}
          </button>
        ) : (
          <>
            <a href={signInHref} className={PRIMARY}>
              Sign in
            </a>
            {signUpHref ? (
              <a href={signUpHref} className="mt-4 block t-caps text-[var(--ink)] no-underline">
                Sign up
              </a>
            ) : null}
          </>
        )}
      </Zone>
    </main>
  );
}
