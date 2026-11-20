"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { HeroName } from "@/shared/components/hero-name";
import { ScreenHeader } from "@/shared/components/screen-header";
import { SectionNumber } from "@/shared/components/section-number";
import { photoSlotLookClass } from "@/shared/lib/photo-look";
import { viewContactLines } from "@/features/contact-collect/view-lines";
import type { ExternalContact } from "@/features/contact-collect/types";

const SECTION =
  "grid grid-cols-[86px_minmax(0,1fr)] items-start gap-x-[14px] border-b border-[var(--rule)] py-[18px]";

export function ContactScreen({ contact }: { contact: ExternalContact }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const swapped = Boolean(contact.pushbackAt);
  const lines = viewContactLines(contact.lines);
  const headerTitle =
    contact.headerField === "position" && contact.position.trim()
      ? contact.position.trim()
      : contact.headerField === "company" && contact.company.trim()
        ? contact.company.trim()
        : "";
  const noteText = [contact.note.trim(), contact.eventTag.trim()].filter(Boolean).join("\n");

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
        <div className="flex items-end gap-3 overflow-visible pb-[18px]" style={{ minHeight: 128 }}>
          <span className={cn("size-[128px] shrink-0 overflow-visible bg-white", photoSlotLookClass("shadow"))}>
            {contact.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={contact.photoUrl} alt="" className="size-full object-cover" />
            ) : null}
          </span>
          <div className="flex min-h-[128px] min-w-0 flex-1 flex-col justify-end">
            <div className="min-h-0 min-w-0" style={{ height: headerTitle ? 112 : 128 }}>
              <HeroName
                value={contact.displayName}
                placeholder="Name"
                locked
                roleBelow={Boolean(headerTitle)}
              />
            </div>
            {headerTitle ? (
              <p className="m-0 t-label uppercase text-[var(--grey)]">{headerTitle}</p>
            ) : null}
          </div>
        </div>

        <section className={SECTION}>
          <div className="min-w-0">
            <SectionNumber value="01" />
            <span className="mt-[6px] block t-label text-[var(--grey)]">Position</span>
          </div>
          {contact.position.trim() ? (
            <p className="m-0 t-body text-[var(--ink)]">{contact.position.trim()}</p>
          ) : (
            <span aria-hidden className="block min-h-[1.45em]" />
          )}
        </section>

        <section className={SECTION}>
          <div className="min-w-0">
            <SectionNumber value="02" />
            <span className="mt-[6px] block t-label text-[var(--grey)]">Company</span>
          </div>
          {contact.company.trim() ? (
            <p className="m-0 t-body text-[var(--ink)]">{contact.company.trim()}</p>
          ) : (
            <span aria-hidden className="block min-h-[1.45em]" />
          )}
        </section>

        <section className={SECTION}>
          <div className="min-w-0">
            <SectionNumber value="03" />
            <span className="mt-[6px] block t-label text-[var(--grey)]">Contacts</span>
          </div>
          <div className="flex min-w-0 flex-col gap-[10px]">
            {lines.length === 0 ? <span aria-hidden className="block min-h-[1.45em]" /> : null}
            {lines.map((line) =>
              line.href ? (
                <a
                  key={line.key}
                  href={line.href}
                  target="_blank"
                  rel="noreferrer"
                  className="m-0 block t-body text-[var(--ink)] no-underline"
                >
                  {line.label}
                </a>
              ) : (
                <p key={line.key} className="m-0 t-body text-[var(--ink)]">
                  {line.label}
                </p>
              ),
            )}
          </div>
        </section>

        <section className={SECTION}>
          <div className="min-w-0">
            <SectionNumber value="04" />
            <span className="mt-[6px] block t-label text-[var(--grey)]">Note</span>
          </div>
          {noteText ? (
            <p className="m-0 whitespace-pre-wrap t-body text-[var(--ink)]">{noteText}</p>
          ) : (
            <span aria-hidden className="block min-h-[1.45em]" />
          )}
        </section>

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
