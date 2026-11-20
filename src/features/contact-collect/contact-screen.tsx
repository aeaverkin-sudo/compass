"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Hand } from "lucide-react";
import { cn } from "@/lib/utils";
import { HeroName } from "@/shared/components/hero-name";
import { ScreenHeader } from "@/shared/components/screen-header";
import { photoSlotLookClass } from "@/shared/lib/photo-look";
import { viewContactLines } from "@/features/contact-collect/view-lines";
import type { ExternalContact } from "@/features/contact-collect/types";

const ROW = "border-b border-[var(--rule)] py-[14px]";

export function ContactScreen({ contact }: { contact: ExternalContact }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const swapped = Boolean(contact.pushbackAt);
  const lines = viewContactLines(contact.lines);

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/external-contacts/${contact.id}`, { method: "DELETE" });
      if (!response.ok) {
        setError("Could not delete the contact.");
        setBusy(false);
        setArmed(false);
        return;
      }
      router.replace("/network");
    } catch {
      setError("Could not delete the contact.");
      setBusy(false);
      setArmed(false);
    }
  };

  return (
    <main className="compass-main flex flex-col overflow-hidden bg-white text-[var(--ink)]">
      <div className="min-h-0 flex-1 overflow-y-auto px-[var(--gutter)]">
        <ScreenHeader title={contact.displayName.trim().split("\n")[0] || "Contact"} fallbackHref="/network" />
        <div className="flex items-end gap-3 overflow-visible pb-[18px]" style={{ minHeight: 64 }}>
          <span className={cn("size-16 shrink-0 overflow-visible bg-white", photoSlotLookClass("shadow"))}>
            {contact.photoUrl ? <img src={contact.photoUrl} alt="" className="size-full object-cover" /> : null}
          </span>
          <div className="flex min-h-16 min-w-0 flex-1 items-end gap-1.5">
            <div className="min-h-0 min-w-0 flex-1" style={{ height: 64 }}>
              <HeroName value={contact.displayName} placeholder="Name" locked />
            </div>
            <Hand className="mb-1 size-4 shrink-0" strokeWidth={1.5} aria-hidden />
          </div>
        </div>
        {contact.position ? <p className={`m-0 t-body ${ROW}`}>{contact.position}</p> : null}
        {contact.company ? <p className={`m-0 t-body ${ROW}`}>{contact.company}</p> : null}
        {lines.map((line) =>
          line.href ? (
            <a
              key={line.key}
              href={line.href}
              target="_blank"
              rel="noreferrer"
              className={`m-0 block t-body text-[var(--ink)] no-underline ${ROW}`}
            >
              {line.label}
            </a>
          ) : (
            <p key={line.key} className={`m-0 t-body ${ROW}`}>
              {line.label}
            </p>
          ),
        )}
        {contact.note ? (
          <p className={`m-0 whitespace-pre-wrap t-body ${ROW}`}>{contact.note}</p>
        ) : null}
        {contact.eventTag ? <p className={`m-0 t-body ${ROW}`}>{contact.eventTag}</p> : null}
        {error ? <p className="mt-3 t-meta text-[#E23B2F]">{error}</p> : null}
      </div>
      <div className="flex border-t border-[var(--rule)] pb-[max(0px,env(safe-area-inset-bottom))]">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (!armed) {
              setArmed(true);
              return;
            }
            void remove();
          }}
          className="press min-h-11 flex-1 border-0 bg-transparent t-caps text-[var(--ink)] disabled:text-[var(--grey)]"
        >
          {armed ? "Delete?" : "Delete"}
        </button>
        <button
          type="button"
          onClick={() => {
            if (armed) {
              setArmed(false);
              return;
            }
            router.push(`/network/x/${contact.id}/edit`);
          }}
          className="press min-h-11 flex-1 border-0 bg-transparent t-caps text-[var(--ink)]"
        >
          Edit
        </button>
        <button
          type="button"
          disabled={swapped}
          onClick={() => {
            if (armed) {
              setArmed(false);
              return;
            }
            router.push(`/network/x/${contact.id}/push`);
          }}
          className="press min-h-11 flex-1 border-0 bg-transparent t-caps text-[var(--ink)] disabled:text-[var(--grey)]"
        >
          Swap
        </button>
      </div>
    </main>
  );
}
