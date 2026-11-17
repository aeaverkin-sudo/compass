"use client";

import { useEffect, useRef, useState } from "react";
import { composeCard, orderCardZones } from "@/shared/services/card-zones";
import type { Card, ContactItem } from "@/shared/types";

const APPEAR_MS = 300;
const HOLD_MS = 3700;
const LEAVE_MS = 1500;

/** Photo, name, and the first two sections, in the order the Wallet pass shows them. */
export function walletPassFace(card: Card, items: ContactItem[]): string {
  const linked = card.contactItemIds
    .map((id) => items.find((item) => item.id === id))
    .filter((item): item is ContactItem => Boolean(item));
  const sections = orderCardZones(composeCard(linked, undefined, card).zones, card.rubricOrder).slice(0, 2);
  const rows = sections
    .map((section) => `${section.id}\t${section.title}\t${section.rows[0]?.value ?? ""}`)
    .join("\n");
  return `${card.photoAttachmentId ?? ""}\n${card.photo ?? ""}\n${card.displayName}\n${rows}`;
}

/** The pass changed. It fades in, holds, then fades out. Close starts that fade early. */
export function WalletUpdatePlaque({ onDone }: { onDone: () => void }) {
  const [shown, setShown] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const doneRef = useRef(onDone);
  const fadeTimer = useRef<number | null>(null);
  const doneTimer = useRef<number | null>(null);
  const closed = useRef(false);

  useEffect(() => {
    doneRef.current = onDone;
  });

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setShown(true));
    fadeTimer.current = window.setTimeout(() => setLeaving(true), APPEAR_MS + HOLD_MS);
    doneTimer.current = window.setTimeout(() => doneRef.current(), APPEAR_MS + HOLD_MS + LEAVE_MS);
    return () => {
      window.cancelAnimationFrame(frame);
      if (fadeTimer.current) window.clearTimeout(fadeTimer.current);
      if (doneTimer.current) window.clearTimeout(doneTimer.current);
    };
  }, []);

  const close = () => {
    if (closed.current) return;
    closed.current = true;
    if (fadeTimer.current) window.clearTimeout(fadeTimer.current);
    if (doneTimer.current) window.clearTimeout(doneTimer.current);
    setLeaving(true);
    doneTimer.current = window.setTimeout(() => doneRef.current(), LEAVE_MS);
  };

  return (
    <div
      role="status"
      className="fixed top-1/2 left-1/2 z-50 w-max max-w-[min(100%-48px,280px)] -translate-x-1/2 -translate-y-1/2 bg-sky px-5 py-4 text-center"
      style={{
        opacity: shown && !leaving ? 1 : 0,
        transition: leaving ? `opacity ${LEAVE_MS}ms ease` : `opacity ${APPEAR_MS}ms ease`,
      }}
    >
      <p className="t-body text-[var(--ink)]">Apple Wallet needs an update.</p>
      <p className="mt-2 mb-0 t-meta text-[var(--grey)]">Remove and re-add your card.</p>
      <button type="button" className="mt-3 t-body text-[var(--ink)]" onClick={close}>
        Close
      </button>
    </div>
  );
}
