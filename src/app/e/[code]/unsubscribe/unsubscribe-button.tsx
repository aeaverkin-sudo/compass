"use client";

import { useState } from "react";

const SKY =
  "press border-0 bg-sky px-[21.6px] py-[10.8px] t-caps text-[var(--ink)] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]";

export function UnsubscribeButton({
  lookup,
  token,
  done,
  doneText,
}: {
  lookup: string;
  token: string;
  done: boolean;
  doneText: string;
}) {
  const [gone, setGone] = useState(done);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unsubscribe = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(lookup)}/unsubscribe?g=${encodeURIComponent(token)}`, {
        method: "POST",
      });
      if (!response.ok) throw new Error();
      setGone(true);
    } catch {
      setError("Could not unsubscribe.");
    } finally {
      setBusy(false);
    }
  };

  if (gone) return <p className="m-0 max-w-[300px] t-body text-[var(--ink)]">{doneText}</p>;
  return (
    <>
      <button type="button" disabled={busy} onClick={() => void unsubscribe()} className={SKY}>
        Unsubscribe
      </button>
      {error ? <p className="mt-3 mb-0 t-meta text-[var(--ink)]">{error}</p> : null}
    </>
  );
}
