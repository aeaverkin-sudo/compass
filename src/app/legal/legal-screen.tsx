"use client";

import { useEffect, useRef, useState } from "react";
import { ScreenHeader } from "@/shared/components/screen-header";
import { LegalDocument } from "@/shared/components/legal-document";

const PLAQUES = [
  ["terms", "Terms & Conditions"],
  ["privacy", "Privacy Policy"],
] as const;

export function LegalScreen({ terms, privacy }: { terms: string; privacy: string }) {
  const [open, setOpen] = useState<(typeof PLAQUES)[number][0]>("terms");
  const [consent, setConsent] = useState<string | null>(null);
  const [objection, setObjection] = useState<"idle" | "busy" | "saved" | "failed">("idle");
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/account/status", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok || cancelled) return;
        const body = (await response.json()) as { consentVersion?: string | null };
        if (!cancelled) setConsent(body.consentVersion?.trim() || "");
      })
      .catch(() => undefined);
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
    root.scrollTo({ top: Math.max(0, top), behavior: reduce ? "auto" : "smooth" });
  };

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
      <p className="m-0 shrink-0 pt-3 t-meta text-[var(--grey)]">
        {consent === null ? "…" : consent ? `Consent v${consent}` : "Not recorded"}
      </p>
      <p className="m-0 max-w-md shrink-0 pt-2 t-meta text-[var(--grey)]">
        Download data in Account is your copy of this account. For a broader request about your personal data, email support@adedme.com. We confirm it is you and reply within one month.
      </p>
      <button
        type="button"
        disabled={objection === "busy" || objection === "saved"}
        onClick={() => {
          if (objection === "busy" || objection === "saved") return;
          setObjection("busy");
          void fetch("/api/account/product-count-objection", { method: "POST" })
            .then((response) => setObjection(response.ok ? "saved" : "failed"))
            .catch(() => setObjection("failed"));
        }}
        className="m-0 mt-2 max-w-md shrink-0 border-0 bg-transparent p-0 text-left t-meta text-[var(--ink)] underline disabled:no-underline"
      >
        {objection === "saved"
          ? "Totals linked to your account will not be added."
          : objection === "failed"
            ? "Could not save the objection. Email support@adedme.com."
            : "Object to totals linked to your account"}
      </button>
      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        <div id="terms">
          <LegalDocument source={terms} />
        </div>
        <div id="privacy">
          <LegalDocument source={privacy} />
        </div>
      </div>
    </main>
  );
}
