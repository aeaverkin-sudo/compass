"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ScreenHeader } from "@/shared/components/screen-header";
import { LegalDocument } from "@/shared/components/legal-document";

const PLAQUES = [
  ["terms", "Terms & Conditions"],
  ["privacy", "Privacy Policy"],
] as const;

const ASK_SENTENCE = "You can also object to statistics linked to your account.";
const ASK_PHRASE = "object to statistics linked to your account";
const OFF_SENTENCE = "Statistics linked to your account are off.";

export function LegalScreen({ terms, privacy }: { terms: string; privacy: string }) {
  const [open, setOpen] = useState<(typeof PLAQUES)[number][0]>("terms");
  const [objected, setObjected] = useState<boolean | null>(null);
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  const skipSpy = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/account/product-count-objection", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok || cancelled) {
          if (!cancelled) setObjected(false);
          return;
        }
        const body = (await response.json()) as { objected?: boolean };
        if (!cancelled) setObjected(body.objected === true);
      })
      .catch(() => {
        if (!cancelled) setObjected(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const go = (id: (typeof PLAQUES)[number][0]) => {
    setOpen(id);
    const root = scrollerRef.current;
    const target = root?.querySelector<HTMLElement>(`#${id}`);
    const heading = target?.querySelector<HTMLElement>("h1") ?? target;
    if (!root || !heading) return;
    const top = heading.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    skipSpy.current = true;
    root.scrollTo({ top: Math.max(0, top), behavior: reduce ? "auto" : "smooth" });
    window.setTimeout(() => {
      skipSpy.current = false;
    }, reduce ? 0 : 800);
  };

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;
    const place = () => {
      if (skipSpy.current) return;
      const node = root.querySelector<HTMLElement>("#privacy");
      if (!node) return;
      const top = node.getBoundingClientRect().top - root.getBoundingClientRect().top;
      setOpen(top <= 12 ? "privacy" : "terms");
    };
    const release = () => {
      skipSpy.current = false;
    };
    root.addEventListener("scroll", place, { passive: true });
    root.addEventListener("pointerdown", release);
    return () => {
      root.removeEventListener("scroll", place);
      root.removeEventListener("pointerdown", release);
    };
  }, []);

  const confirm = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/account/product-count-objection", { method: "POST" });
      if (!response.ok) throw new Error("again");
      setObjected(true);
      setAsk(false);
    } catch {
      setError("Could not turn statistics off.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const phrase: ReactNode =
    objected === false ? (
      <span
        role="button"
        tabIndex={0}
        className="cursor-pointer font-[inherit] t-body text-inherit underline"
        onClick={() => {
          setError(null);
          setAsk(true);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          setError(null);
          setAsk(true);
        }}
      >
        {ASK_PHRASE}
      </span>
    ) : undefined;

  const privacySource =
    objected === true ? privacy.replace(ASK_SENTENCE, OFF_SENTENCE) : privacy;

  return (
    <main className="compass-main flex h-dvh flex-col overflow-hidden bg-white px-[var(--gutter)] text-[var(--ink)]">
      <ScreenHeader title="Legal" fallbackHref="/profile" />
      <div className="grid shrink-0 grid-cols-2 gap-1.5 pt-[18px]">
        {PLAQUES.map(([id, label]) => {
          const on = open === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => go(id)}
              className="flex items-center justify-center border-0 px-2 text-center"
              style={{
                minHeight: 34.2,
                background: on ? "var(--sky)" : "#fff",
                color: "var(--ink)",
                boxShadow: on ? "none" : "0 2px 8px rgba(17,17,17,0.16)",
                fontSize: 13,
                fontWeight: 400,
                letterSpacing: "0.12em",
                lineHeight: 1.1,
                textTransform: "uppercase",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto pt-[18px] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        <div id="terms">
          <LegalDocument source={terms} />
        </div>
        <div id="privacy">
          <LegalDocument source={privacySource} phrase={phrase ? ASK_PHRASE : undefined} phraseNode={phrase} />
        </div>
      </div>
      <Dialog.Root
        open={ask}
        onOpenChange={(next) => {
          if (busy) return;
          if (!next) {
            setAsk(false);
            setError(null);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-transparent" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-max max-w-[min(100%-48px,280px)] -translate-x-1/2 -translate-y-1/2 bg-sky px-5 py-4 text-center outline-none">
            <Dialog.Title className="t-body text-[var(--ink)]">Turn off account-linked statistics?</Dialog.Title>
            <Dialog.Description className="mt-2 t-meta text-[var(--grey)]">
              We’ll delete the daily totals linked to your account and stop adding new ones. This can’t be undone in
              Account.
            </Dialog.Description>
            {error ? <p className="mt-2 mb-0 t-meta text-[var(--ink)]">{error}</p> : null}
            <div className="mt-3 flex justify-center gap-6">
              <button type="button" className="t-body text-[var(--grey)]" onClick={() => setAsk(false)} disabled={busy}>
                Cancel
              </button>
              <button
                type="button"
                className="t-body text-[var(--ink)] disabled:text-[var(--grey)]"
                disabled={busy}
                onClick={() => void confirm()}
              >
                Confirm
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  );
}
