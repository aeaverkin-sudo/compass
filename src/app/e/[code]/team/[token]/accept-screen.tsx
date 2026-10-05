"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenHeader } from "@/shared/components/screen-header";
import { VALUE_AXIS_PX } from "@/shared/layout/axes";

const SKY =
  "press border-0 bg-sky px-[21.6px] py-[10.8px] t-caps text-[var(--ink)] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]";

export function AcceptScreen({
  lookup,
  token,
  ownerName,
  eventName,
  access,
}: {
  lookup: string;
  token: string;
  ownerName: string;
  eventName: string;
  access: string;
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
      <ScreenHeader title="Team" fallbackHref={`/e/${encodeURIComponent(lookup)}`} />
      <p className="mb-0 t-body text-[var(--ink)]">
        {`${ownerName} invited you to help at ${eventName}. Access: ${access}.`}
      </p>
      {error ? <p className="mt-4 mb-0 t-meta text-[var(--ink)]">{error}</p> : null}
      <button type="button" disabled={busy} onClick={() => void accept()} className={`mt-8 ${SKY}`} style={{ marginLeft: VALUE_AXIS_PX }}>
        Accept
      </button>
    </main>
  );
}
