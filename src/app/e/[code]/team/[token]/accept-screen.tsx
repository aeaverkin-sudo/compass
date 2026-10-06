"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CoverButton } from "@/shared/event/cover-button";
import type { InviteCoverEvent } from "@/shared/event/invite-cover";
import type { TeamRoleName } from "@/shared/event/permissions";
import type { EventLayoutId, EventThemeId } from "@/shared/event/themes";
import { ScreenHeader } from "@/shared/components/screen-header";
import { VALUE_AXIS_PX } from "@/shared/layout/axes";

const SKY =
  "press border-0 bg-sky px-[21.6px] py-[10.8px] t-caps text-[var(--ink)] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]";

export function AcceptScreen({
  lookup,
  token,
  ownerName,
  eventName,
  role,
  roleDetail,
  whenLine,
  layout,
  themeId,
  cover,
  signInHref,
}: {
  lookup: string;
  token: string;
  ownerName: string;
  eventName: string;
  role: TeamRoleName;
  roleDetail: string;
  whenLine: string | null;
  layout: EventLayoutId;
  themeId: EventThemeId;
  cover: InviteCoverEvent;
  /** Set when the viewer still has to sign in. Accept then continues on this invite. */
  signInHref?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(lookup)}/managers/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "Could not accept.");
        return;
      }
      router.push(`/e/${encodeURIComponent(lookup)}/manage`);
      router.refresh();
    } catch {
      setError("Could not accept.");
      setBusy(false);
    }
  };

  return (
    <main className="compass-main min-h-dvh overflow-y-auto bg-white px-[var(--gutter)] pb-[max(2.5rem,env(safe-area-inset-bottom))] text-[var(--ink)]">
      <ScreenHeader title="Team invite" fallbackHref={`/e/${encodeURIComponent(lookup)}`} />
      <div className="w-[200px]">
        <CoverButton variant="card" layout={layout} themeId={themeId} event={cover} />
      </div>
      <p className="mt-6 mb-0 t-body text-[var(--ink)]">{`${ownerName} invited you to help run ${eventName}.`}</p>
      <p className="mt-4 mb-0 t-body text-[var(--ink)]">{`Role: ${role}.`}</p>
      {roleDetail ? <p className="mt-2 mb-0 t-meta text-[var(--grey)]">{roleDetail}</p> : null}
      {whenLine ? <p className="mt-4 mb-0 t-meta text-[var(--grey)]">{whenLine}</p> : null}
      {error ? <p className="mt-4 mb-0 t-meta text-[var(--ink)]">{error}</p> : null}
      {signInHref ? (
        <a href={signInHref} className={`mt-8 inline-block no-underline ${SKY}`} style={{ marginLeft: VALUE_AXIS_PX }}>
          Accept
        </a>
      ) : (
        <button type="button" disabled={busy} onClick={() => void accept()} className={`mt-8 ${SKY}`} style={{ marginLeft: VALUE_AXIS_PX }}>
          Accept
        </button>
      )}
    </main>
  );
}
