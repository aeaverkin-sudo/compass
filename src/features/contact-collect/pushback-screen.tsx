"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenHeader } from "@/shared/components/screen-header";
import { SectionNumber } from "@/shared/components/section-number";
import { useNamedShareCards } from "@/shared/components/share-pick";
import { pushTargets } from "@/features/contact-collect/pushback";
import type { ExternalContact, PushbackChannel } from "@/features/contact-collect/types";

const SECTION = "grid grid-cols-[86px_minmax(0,1fr)] items-start gap-x-[14px] border-b border-[var(--rule)] py-[18px]";
const OK =
  "press mt-[18px] w-full border-0 bg-sky px-6 py-3 t-caps text-[var(--ink)] shadow-none disabled:text-[var(--grey)] [-webkit-tap-highlight-color:transparent]";

export function PushbackScreen({ contact, fresh }: { contact: ExternalContact; fresh: boolean }) {
  const router = useRouter();
  const cards = useNamedShareCards();
  const targets = pushTargets(contact.lines);
  const sent = Boolean(contact.pushbackAt);
  const [cardId, setCardId] = useState<string | null>(null);
  const [channel, setChannel] = useState<PushbackChannel | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Messenger URL when a new context could not be opened after OK. */
  const [handoffUrl, setHandoffUrl] = useState<string | null>(null);

  const networkHref = fresh
    ? `/network?added=${encodeURIComponent(contact.displayName.trim() || "Contact")}`
    : "/network";

  const leave = () => {
    if (fresh) {
      router.replace(`/network?added=${encodeURIComponent(contact.displayName.trim() || "Contact")}`);
      return;
    }
    router.replace(`/network/x/${contact.id}`);
  };

  const goNetwork = () => {
    router.replace(networkHref);
  };

  const openInHandoff = (handoff: Window | null, url: string) => {
    if (handoff) {
      try {
        handoff.location.href = url;
        return true;
      } catch {
        try {
          handoff.close();
        } catch {
          /* ignore */
        }
      }
    }
    try {
      return Boolean(window.open(url, "_blank"));
    } catch {
      return false;
    }
  };

  const finish = async () => {
    if (busy || handoffUrl) return;
    if (sent) {
      leave();
      return;
    }
    if ((cardId && !channel) || (!cardId && channel)) {
      setError("Choose a portfolio and where to send it, or leave both empty.");
      return;
    }
    if (!cardId || !channel) {
      leave();
      return;
    }

    // Open during the tap — after await, iOS often blocks a new context.
    const handoff =
      channel === "whatsapp" || channel === "telegram" ? window.open("about:blank", "_blank") : null;

    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/external-contacts/${contact.id}/pushback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, channel }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        open?: string;
      } | null;
      if (response.status === 409) {
        handoff?.close();
        leave();
        return;
      }
      if (!response.ok) {
        handoff?.close();
        setError(body?.error || "Could not send.");
        setBusy(false);
        return;
      }
      if (body?.open) {
        if (!openInHandoff(handoff, body.open)) {
          setHandoffUrl(body.open);
          setBusy(false);
          return;
        }
        goNetwork();
        return;
      }
      handoff?.close();
      goNetwork();
    } catch {
      handoff?.close();
      setError("Could not send.");
      setBusy(false);
    }
  };

  const openHandoff = () => {
    if (!handoffUrl) return;
    try {
      window.open(handoffUrl, "_blank");
    } catch {
      window.location.assign(handoffUrl);
      return;
    }
    goNetwork();
  };

  return (
    <main className="compass-main flex flex-col overflow-hidden bg-white text-[var(--ink)]">
      <div className="min-h-0 flex-1 overflow-y-auto px-[var(--gutter)] pb-[max(24px,env(safe-area-inset-bottom))]">
        <ScreenHeader title="Swap" fallbackHref={fresh ? "/network" : `/network/x/${contact.id}`} />
        {sent ? (
          <p className="m-0 t-body">Already sent.</p>
        ) : (
          <>
            <section className={SECTION}>
              <div className="min-w-0">
                <SectionNumber value="01" />
                <span className="mt-[6px] block t-label text-[var(--grey)]">Portfolio</span>
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                {cards.length === 0 ? <p className="m-0 t-body text-[var(--grey)]">No portfolio yet.</p> : null}
                {cards.map((card) => {
                  const on = card.id === cardId;
                  return (
                    <button
                      key={card.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setCardId(on ? null : card.id)}
                      className={`press flex w-full min-w-0 items-center gap-3 border-0 px-2 py-2 text-left [-webkit-tap-highlight-color:transparent] ${on ? "bg-sky" : "bg-transparent"}`}
                    >
                      {card.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={card.photo} alt="" className="size-12 shrink-0 object-cover" />
                      ) : (
                        <span className="size-12 shrink-0 bg-[#d9d9d9]" aria-hidden />
                      )}
                      <span className="min-w-0 truncate t-body">{card.name}</span>
                    </button>
                  );
                })}
              </div>
            </section>
            <section className={SECTION}>
              <div className="min-w-0">
                <SectionNumber value="02" />
                <span className="mt-[6px] block t-label text-[var(--grey)]">Send to</span>
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                {targets.length === 0 ? <p className="m-0 t-body text-[var(--grey)]">No email, WhatsApp, or Telegram.</p> : null}
                {targets.map((target) => {
                  const on = target.channel === channel;
                  return (
                    <button
                      key={target.channel}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setChannel(on ? null : target.channel)}
                      className={`press flex w-full min-w-0 flex-col border-0 px-2 py-2 text-left [-webkit-tap-highlight-color:transparent] ${on ? "bg-sky" : "bg-transparent"}`}
                    >
                      <span className="t-body">{target.label}</span>
                      <span className="truncate t-meta text-[var(--grey)]">{target.value}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          </>
        )}
        {error ? <p className="mt-3 t-meta text-[#E23B2F]">{error}</p> : null}
        {handoffUrl ? (
          <button type="button" onClick={openHandoff} className={OK}>
            {channel === "telegram" ? "Open Telegram" : "Open WhatsApp"}
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={() => void finish()} className={OK}>
            OK
          </button>
        )}
      </div>
    </main>
  );
}
