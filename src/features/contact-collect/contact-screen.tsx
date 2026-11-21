"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { TabBand } from "@main/components/tab-band";
import { HeroName } from "@/shared/components/hero-name";
import { ScreenHeader } from "@/shared/components/screen-header";
import { SectionNumber } from "@/shared/components/section-number";
import { photoSlotLookClass } from "@/shared/lib/photo-look";
import { viewContactLines } from "@/features/contact-collect/view-lines";
import type { ExternalContact } from "@/features/contact-collect/types";

const SECTION =
  "grid grid-cols-[86px_minmax(0,1fr)] items-start gap-x-[14px] border-b border-[var(--rule)] py-[18px]";
const BAND =
  "press flex h-full min-h-11 w-full items-center border-0 bg-transparent p-0 t-band uppercase disabled:text-[var(--grey)] [-webkit-tap-highlight-color:transparent]";

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
    <main className="compass-main flex h-dvh flex-col overflow-hidden bg-white text-[var(--ink)]">
      <div className="card-scroll-spring flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="compass-card-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-[var(--gutter)]">
          <div>
        <ScreenHeader title="" fallbackHref="/network" />
        <div className="pb-[18px]">
        <div className="relative flex shrink-0 items-stretch gap-3" style={{ height: 128 }}>
          <span className={cn("size-[128px] shrink-0 overflow-visible bg-white", photoSlotLookClass("shadow"))}>
            {contact.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={contact.photoUrl} alt="" className="size-full object-cover" />
            ) : null}
          </span>
          <div className="relative flex h-full min-w-0 flex-1 flex-col">
            <HeroName
              value={contact.displayName}
              placeholder="Name"
              locked
              roleBelow={Boolean(headerTitle)}
            />
            {headerTitle ? (
              <p className="m-0 line-clamp-3 min-w-0 shrink-0 overflow-hidden t-label uppercase text-[var(--grey)]">
                {headerTitle}
              </p>
            ) : null}
          </div>
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
        </div>
      </div>
      <TabBand
        label="Contact"
        left={
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
            className={BAND}
          >
            {armed ? "Delete?" : "Delete"}
          </button>
        }
        center={
          <button
            type="button"
            onClick={() => {
              if (armed) {
                setArmed(false);
                return;
              }
              router.push(`/network/x/${contact.id}/edit`);
            }}
            className={BAND}
          >
            Edit
          </button>
        }
        right={
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
            className={BAND}
          >
            Swap
          </button>
        }
      />
    </main>
  );
}
