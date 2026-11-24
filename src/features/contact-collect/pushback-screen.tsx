"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenHeader } from "@/shared/components/screen-header";
import { SectionNumber } from "@/shared/components/section-number";
import { cardPhotoSrc } from "@/shared/services/card-photo";
import { useAppStore } from "@/shared/store/app-store";
import { draftStillCurrent, pushTargets } from "@/features/contact-collect/pushback";
import type { ExternalContact, PushbackChannel } from "@/features/contact-collect/types";

const SECTION = "grid grid-cols-[86px_minmax(0,1fr)] items-start gap-x-[14px] border-b border-[var(--rule)] py-[18px]";
const OK =
  "press mt-[18px] block w-full border-0 bg-sky px-6 py-3 text-center t-caps text-[var(--ink)] no-underline shadow-none disabled:text-[var(--grey)] [-webkit-tap-highlight-color:transparent]";

type Draft = { mailto?: string; open?: string; text?: string };

function useSwapPortfolios() {
  const cards = useAppStore((state) => state.cards);
  return cards.flatMap((card) => {
    const name = card.displayName.trim();
    if (!name || card.status === "archived" || card.status === "suspended") return [];
    return [{ id: card.id, name, photo: cardPhotoSrc(card) }];
  });
}

export function PushbackScreen({ contact, fresh }: { contact: ExternalContact; fresh: boolean }) {
  const router = useRouter();
  const cards = useSwapPortfolios();
  const targets = pushTargets(contact.lines);
  const [cardId, setCardId] = useState<string | null>(null);
  const [channel, setChannel] = useState<PushbackChannel | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const selection = useRef({ contactId: contact.id, cardId: "", channel: "" });
  selection.current = { contactId: contact.id, cardId: cardId ?? "", channel: channel ?? "" };

  const leave = () => {
    if (fresh) {
      router.replace(`/network?added=${encodeURIComponent(contact.displayName.trim() || "Contact")}`);
      return;
    }
    router.replace(`/network/x/${contact.id}`);
  };

  useEffect(() => {
    if (!cardId || !channel) {
      setDraft(null);
      setWaiting(false);
      return;
    }
    const started = { contactId: contact.id, cardId, channel };
    let cancel = false;
    setDraft(null);
    setWaiting(true);
    setError(null);
    setCopyError(null);
    void (async () => {
      try {
        const response = await fetch(`/api/external-contacts/${contact.id}/pushback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ cardId, channel, prepare: true }),
        });
        const body = (await response.json().catch(() => null)) as (Draft & { error?: string }) | null;
        if (cancel || !draftStillCurrent(started, selection.current)) return;
        const mailto = body?.mailto;
        const open = body?.open;
        if (!response.ok || (channel === "email" ? !mailto : !open)) {
          setDraft(null);
          setWaiting(false);
          setError(channel === "email" ? "Could not prepare the email draft" : body?.error || "Could not prepare the draft.");
          return;
        }
        setDraft({ mailto, open, text: body?.text });
        setWaiting(false);
      } catch {
        if (cancel || !draftStillCurrent(started, selection.current)) return;
        setDraft(null);
        setWaiting(false);
        setError(channel === "email" ? "Could not prepare the email draft" : "Could not prepare the draft.");
      }
    })();
    return () => {
      cancel = true;
    };
  }, [cardId, channel, contact.id, retry]);

  const partial = Boolean(cardId) !== Boolean(channel);
  const mailHref = channel === "email" ? draft?.mailto : undefined;
  const openHref = channel && channel !== "email" ? draft?.open : undefined;

  const copy = async () => {
    if (!draft?.text) return;
    try {
      await navigator.clipboard.writeText(draft.text);
      setCopyError(null);
    } catch {
      setCopyError("Could not copy the message.");
    }
  };

  return (
    <main className="compass-main flex flex-col overflow-hidden bg-white text-[var(--ink)]">
      <div className="min-h-0 flex-1 overflow-y-auto px-[var(--gutter)] pb-[max(24px,env(safe-area-inset-bottom))]">
        <ScreenHeader title="Swap" fallbackHref={fresh ? "/network" : `/network/x/${contact.id}`} />
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
                  onClick={() => {
                    setError(null);
                    setCardId(on ? null : card.id);
                  }}
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
                  onClick={() => {
                    setError(null);
                    setChannel(on ? null : target.channel);
                  }}
                  className={`press flex w-full min-w-0 flex-col border-0 px-2 py-2 text-left [-webkit-tap-highlight-color:transparent] ${on ? "bg-sky" : "bg-transparent"}`}
                >
                  <span className="t-body">{target.label}</span>
                  <span className="truncate t-meta text-[var(--grey)]">{target.value}</span>
                </button>
              );
            })}
          </div>
        </section>
        {error ? <p className="mt-3 t-meta text-[#E23B2F]">{error}</p> : null}
        {copyError ? <p className="mt-3 t-meta text-[#E23B2F]">{copyError}</p> : null}
        {mailHref && draft?.text ? (
          <>
            <a href={mailHref} className={OK}>
              Open email draft
            </a>
            <button type="button" onClick={() => void copy()} className={OK}>
              Copy message
            </button>
          </>
        ) : openHref ? (
          <a href={openHref} className={OK}>
            {channel === "telegram" ? "Open Telegram" : "Open WhatsApp"}
          </a>
        ) : waiting ? (
          <button type="button" disabled className={OK}>
            Preparing
          </button>
        ) : error && cardId && channel ? (
          <button type="button" onClick={() => setRetry((value) => value + 1)} className={OK}>
            Try again
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (partial) {
                setError("Choose a portfolio and where to send it, or leave both empty.");
                return;
              }
              leave();
            }}
            className={OK}
          >
            OK
          </button>
        )}
      </div>
    </main>
  );
}
