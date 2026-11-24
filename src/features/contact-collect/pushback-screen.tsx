"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenHeader } from "@/shared/components/screen-header";
import { SectionNumber } from "@/shared/components/section-number";
import { cardPhotoSrc } from "@/shared/services/card-photo";
import { useAppStore } from "@/shared/store/app-store";
import {
  armSwapReturn,
  draftStillCurrent,
  expireSwapReturn,
  finishSwapReturn,
  forgetSwapHandoff,
  keptSwapCard,
  noteSwapBlur,
  noteSwapHidden,
  pushTargets,
  rememberSwapHandoff,
  swapCardOffered,
  swapFooter,
  swapHandoffPending,
  visibleDraft,
  type DraftChoice,
  type SwapReturn,
} from "@/features/contact-collect/pushback";
import type { ExternalContact, PushbackChannel } from "@/features/contact-collect/types";

const SECTION = "grid grid-cols-[86px_minmax(0,1fr)] items-start gap-x-[14px] border-b border-[var(--rule)] py-[18px]";
const OK =
  "press mt-[18px] block w-full border-0 bg-sky px-6 py-3 text-center t-caps text-[var(--ink)] no-underline shadow-none disabled:text-[var(--grey)] [-webkit-tap-highlight-color:transparent]";

type Draft = DraftChoice & { mailto?: string; open?: string; text?: string };

function useSwapPortfolios() {
  const cards = useAppStore((state) => state.cards);
  return cards.flatMap((card) => {
    if (!swapCardOffered(card)) return [];
    return [{ id: card.id, name: card.displayName.trim(), photo: cardPhotoSrc(card) }];
  });
}

export function PushbackScreen({ contact, fresh }: { contact: ExternalContact; fresh: boolean }) {
  const router = useRouter();
  const cards = useSwapPortfolios();
  const targets = pushTargets(contact.lines);
  const [cardId, setCardId] = useState<string | null>(null);
  const [declinedSole, setDeclinedSole] = useState<string | null>(null);
  const [channel, setChannel] = useState<PushbackChannel | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const handoff = useRef<SwapReturn>({ armed: false, left: false, blurredAt: null, armedAt: 0 });
  const offeredIds = cards.map((card) => card.id);
  const soleId = offeredIds.length === 1 ? offeredIds[0] : null;
  if (soleId && !cardId && soleId !== declinedSole) setCardId(soleId);
  const activeCardId = keptSwapCard(cardId, offeredIds);
  if (cardId && !activeCardId) setCardId(null);
  const current: DraftChoice = {
    contactId: contact.id,
    cardId: activeCardId ?? "",
    channel: channel ?? "",
    name: "",
  };
  const selectionKey = `${current.contactId}\n${current.cardId}\n${current.channel}\n${current.name}`;
  const [shownKey, setShownKey] = useState(selectionKey);
  if (shownKey !== selectionKey) {
    setShownKey(selectionKey);
    setDraft(null);
    setError(null);
  }
  const selection = useRef(current);
  selection.current = current;
  const live = visibleDraft(draft, current);

  const leave = () => {
    if (fresh) {
      router.replace(`/network?added=${encodeURIComponent(contact.displayName.trim() || "Contact")}`);
      return;
    }
    router.replace(`/network/x/${contact.id}`);
  };

  useEffect(() => {
    const stillHere = () => document.visibilityState === "visible" && document.hasFocus();
    const comeBack = () => {
      if (!stillHere()) return;
      const step = finishSwapReturn(handoff.current, Date.now());
      handoff.current = step.state;
      if (!step.openNetwork) return;
      forgetSwapHandoff();
      router.replace("/network");
    };
    const markLeft = () => {
      if (!handoff.current.armed && swapHandoffPending()) handoff.current = armSwapReturn(Date.now());
      handoff.current = noteSwapHidden(handoff.current);
    };
    const onHide = () => {
      markLeft();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") onHide();
      else comeBack();
    };
    const onBlur = () => {
      handoff.current = noteSwapBlur(handoff.current, Date.now());
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) markLeft();
      comeBack();
    };
    const onResume = () => {
      markLeft();
      comeBack();
    };
    const timer = window.setInterval(() => {
      const next = expireSwapReturn(handoff.current, Date.now(), stillHere());
      if (handoff.current.armed && !next.armed) forgetSwapHandoff();
      handoff.current = next;
    }, 200);
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("freeze", onHide);
    document.addEventListener("resume", onResume);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", comeBack);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("freeze", onHide);
      document.removeEventListener("resume", onResume);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", comeBack);
    };
  }, [router]);

  useEffect(() => {
    if (!activeCardId || !channel) {
      setDraft(null);
      return;
    }
    const started: DraftChoice = { contactId: contact.id, cardId: activeCardId, channel, name: "" };
    let cancel = false;
    setDraft(null);
    setError(null);
    void (async () => {
      try {
        const response = await fetch(`/api/external-contacts/${contact.id}/pushback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            cardId: activeCardId,
            channel,
            prepare: true,
          }),
        });
        const body = (await response.json().catch(() => null)) as { mailto?: string; open?: string; text?: string; error?: string } | null;
        if (cancel || !draftStillCurrent(started, selection.current)) return;
        const mailto = body?.mailto;
        const open = body?.open;
        if (!response.ok || (channel === "email" ? !mailto : !open)) {
          setDraft(null);
          setError(channel === "email" ? "Could not prepare the email draft" : body?.error || "Could not prepare the draft.");
          return;
        }
        setDraft({ ...started, mailto, open, text: body?.text });
      } catch {
        if (cancel || !draftStillCurrent(started, selection.current)) return;
        setDraft(null);
        setError(channel === "email" ? "Could not prepare the email draft" : "Could not prepare the draft.");
      }
    })();
    return () => {
      cancel = true;
    };
  }, [activeCardId, channel, contact.id, retry]);

  const mailHref = live?.channel === "email" ? live.mailto : undefined;
  const openHref = live && live.channel !== "email" ? live.open : undefined;

  const armReturn = () => {
    const now = Date.now();
    handoff.current = armSwapReturn(now);
    rememberSwapHandoff(now);
  };
  const changing = shownKey !== selectionKey;
  const shownError = changing ? null : error;
  const footer = swapFooter({
    cardSelected: Boolean(activeCardId),
    channel,
    ready: Boolean(mailHref || openHref),
    failed: Boolean(shownError && activeCardId && channel),
  });

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
                <div key={card.id} className="min-w-0">
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setError(null);
                      if (on) {
                        if (cards.length === 1) setDeclinedSole(card.id);
                        setCardId(null);
                        return;
                      }
                      setDeclinedSole(null);
                      setCardId(card.id);
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
                </div>
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
        {shownError && footer === "retry" ? <p className="mt-3 t-meta text-[#E23B2F]">{shownError}</p> : null}
        {footer === "email" && mailHref ? (
          <a href={mailHref} className={OK} onClick={armReturn}>
            Open email draft
          </a>
        ) : (footer === "whatsapp" || footer === "telegram") && openHref ? (
          <a href={openHref} className={OK} onClick={armReturn}>
            {footer === "telegram" ? "Open Telegram" : "Open WhatsApp"}
          </a>
        ) : footer === "preparing" ? (
          <button type="button" disabled className={OK}>
            Preparing
          </button>
        ) : footer === "retry" ? (
          <button type="button" onClick={() => setRetry((value) => value + 1)} className={OK}>
            Try again
          </button>
        ) : footer === "need-card" ? (
          <p className="mt-[18px] t-body text-[var(--grey)]">Choose a portfolio.</p>
        ) : (
          <button type="button" onClick={leave} className={OK}>
            OK
          </button>
        )}
      </div>
    </main>
  );
}
