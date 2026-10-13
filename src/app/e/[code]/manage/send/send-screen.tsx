"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SkyToast } from "@/shared/components/sky-toast";
import { guestPassUrl, type GuestPass } from "@/shared/event/guest-book";
import { VALUE_AXIS_PX } from "@/shared/layout/axes";
import { ManageFrame } from "../manage-frame";

const SKY =
  "press border-0 bg-sky px-[21.6px] py-[10.8px] t-caps text-[var(--ink)] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]";

export function SendScreen({
  lookup,
  preview,
  count,
  passes,
  inviteUrl,
  ready,
}: {
  lookup: string;
  /** The mail the first guest gets. */
  preview: string | null;
  count: number;
  passes: GuestPass[];
  inviteUrl: string;
  ready: boolean;
}) {
  const router = useRouter();
  const back = `/e/${encodeURIComponent(lookup)}/manage`;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const lock = useRef(false);

  const send = async () => {
    if (lock.current || count === 0) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(lookup)}/send`, { method: "POST" });
      const body = (await response.json()) as { sent?: number; failed?: number; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not send.");
      if (body.failed) {
        setError(`${body.failed} not sent. They stay Not sent — try again later.`);
        router.refresh();
        lock.current = false;
        setBusy(false);
        return;
      }
      router.replace(back);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not send.");
      lock.current = false;
      setBusy(false);
    }
  };

  const copyLinks = async () => {
    const text = passes.map((pass) => `${pass.name} — ${guestPassUrl(inviteUrl, pass.token)}`).join("\n");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      await navigator.clipboard.writeText(text);
      setNotice("Links copied");
    } catch {
      setNotice("Could not copy");
    }
  };

  const phone = passes.length > 0 ? ` ${passes.length} phone only — copy links below.` : "";

  return (
    <ManageFrame title="Send passes" fallbackHref={back} onBack={() => router.replace(back)}>
      {notice ? <SkyToast key={notice} text={notice} onDone={() => setNotice(null)} /> : null}
      {preview ? (
        <iframe
          title="The mail your guests get"
          srcDoc={preview}
          sandbox=""
          className="mt-[18px] block h-[760px] w-full border border-[var(--rule)] bg-white"
        />
      ) : null}
      <div className="pt-[18px] pb-8" style={{ marginLeft: VALUE_AXIS_PX }}>
        {!ready ? (
          <p className="mb-0 t-meta text-[var(--grey)]">Sending needs the event mails migration.</p>
        ) : count > 0 ? (
          <>
            <p className="mb-0 t-meta text-[var(--grey)]">{`To ${count} ${count === 1 ? "guest" : "guests"} with an email.${phone}`}</p>
            <button type="button" disabled={busy} onClick={() => void send()} className={`mt-4 ${SKY}`}>
              {`Send to ${count}`}
            </button>
          </>
        ) : (
          <p className="mb-0 t-meta text-[var(--grey)]">All passes sent</p>
        )}
        {error ? <p className="mt-3 mb-0 t-meta text-[var(--ink)]">{error}</p> : null}
        {passes.length > 0 ? (
          <button
            type="button"
            onClick={() => void copyLinks()}
            className="press mt-6 block border-0 bg-transparent p-0 text-left t-body text-[var(--ink)] [-webkit-tap-highlight-color:transparent]"
          >
            {`Copy ${passes.length} ${passes.length === 1 ? "link" : "links"}`}
          </button>
        ) : null}
      </div>
    </ManageFrame>
  );
}
