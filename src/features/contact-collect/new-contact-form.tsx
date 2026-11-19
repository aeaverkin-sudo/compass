"use client";

import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { PhotoSlotPicker } from "@landing/components/photo-slot-picker";
import { cn } from "@/lib/utils";
import { ScreenHeader } from "@/shared/components/screen-header";
import { SectionNumber } from "@/shared/components/section-number";
import { uploadAttachment } from "@/shared/services/attachment-upload";
import { detectContactType } from "@/shared/services/contact-item";
import { externalLineIsRed } from "@/features/contact-collect/lines";
import type { ExternalContact, LineFlag } from "@/features/contact-collect/types";

const SECTION = "grid grid-cols-[86px_minmax(0,1fr)] items-start gap-x-[14px] border-b border-[var(--rule)] py-[18px]";
const FIELD =
  "min-w-0 w-full border-0 border-b border-[var(--rule)] bg-transparent py-1 t-body outline-none placeholder:text-[var(--placeholder)]";
const GHOST =
  "press min-h-11 flex-1 border-0 bg-white t-caps text-[var(--ink)] shadow-[0_10px_22px_rgba(20,20,20,0.14)] [-webkit-tap-highlight-color:transparent]";
const SAVE =
  "press mt-[18px] w-full border-0 bg-sky px-6 py-3 t-caps text-[var(--ink)] shadow-none disabled:text-[var(--grey)] [-webkit-tap-highlight-color:transparent]";
type Line = { id: string; value: string; flags: LineFlag[]; marked: boolean };

function blank(): Line {
  return { id: crypto.randomUUID(), value: "", flags: [], marked: false };
}

function linesFrom(initial?: ExternalContact): Line[] {
  if (!initial || initial.lines.length === 0) return [blank()];
  return [
    ...initial.lines.map((line) => ({
      id: crypto.randomUUID(),
      value: line.value,
      flags: line.flags ? [...line.flags] : [],
      marked: false,
    })),
    blank(),
  ];
}

function phoneLine(value: string) {
  return detectContactType(value.trim(), "contact") === "phone";
}

function keepEnter(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key !== "Enter") return;
  event.preventDefault();
}

export function NewContactForm({
  suggestedEvent,
  initial,
}: {
  suggestedEvent: string;
  initial?: ExternalContact;
}) {
  const router = useRouter();
  const editing = Boolean(initial);
  const lastLine = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initial?.displayName ?? "");
  const [position, setPosition] = useState(initial?.position ?? "");
  const [company, setCompany] = useState(initial?.company ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [eventTag, setEventTag] = useState(editing ? (initial?.eventTag ?? "") : suggestedEvent);
  const [eventLive, setEventLive] = useState(editing);
  const [lines, setLines] = useState<Line[]>(() => linesFrom(initial));
  const [photo, setPhoto] = useState<{ file: File; dataUrl: string } | null>(null);
  const [keptPhoto, setKeptPhoto] = useState<string | null>(initial?.photoUrl ?? null);
  const [photoId, setPhotoId] = useState<string | null>(initial?.photoAttachmentId ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ready = name.trim().length > 0 && !busy;

  const updateLine = (id: string, value: string) => {
    setLines((current) => current.map((line) => (line.id === id ? { ...line, value, marked: false } : line)));
  };

  const toggleFlag = (id: string, flag: LineFlag) => {
    setLines((current) =>
      current.map((line) => {
        if (line.id !== id) return line;
        const flags = line.flags.includes(flag) ? line.flags.filter((item) => item !== flag) : [...line.flags, flag];
        return { ...line, flags };
      }),
    );
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const displayName = name.trim();
    if (!displayName || busy) return;
    const filled = lines.map((line) => ({ ...line, value: line.value.trim() })).filter((line) => line.value);
    const refused = filled.some((line) => externalLineIsRed(line.value));
    setLines((current) =>
      current.map((line) => ({
        ...line,
        marked: Boolean(line.value.trim()) && externalLineIsRed(line.value),
      })),
    );
    if (refused) {
      setError("One contact line is not valid.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      let photoAttachmentId = photoId;
      if (photo && !photoId) {
        const readyPhoto = await uploadAttachment({ file: photo.file, kind: "card-photo" });
        photoAttachmentId = readyPhoto.attachmentId;
        setPhotoId(readyPhoto.attachmentId);
      }
      const response = await fetch(initial ? `/api/external-contacts/${initial.id}` : "/api/external-contacts", {
        method: initial ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          position,
          company,
          note,
          eventTag: eventLive ? eventTag : suggestedEvent,
          source: initial?.source ?? "manual",
          photoAttachmentId,
          lines: filled.map((line) => {
            const flags = phoneLine(line.value) ? line.flags : [];
            return flags.length > 0 ? { value: line.value, flags } : { value: line.value };
          }),
        }),
      });
      const saved = (await response.json().catch(() => null)) as {
        error?: string;
        contact?: { id?: string };
      } | null;
      if (!response.ok) {
        setError(saved?.error || "Could not save the contact.");
        setBusy(false);
        return;
      }
      const createdId = typeof saved?.contact?.id === "string" ? saved.contact.id : "";
      router.replace(
        initial
          ? `/network/x/${initial.id}`
          : createdId
            ? `/network/x/${createdId}/push?new=1`
            : `/network?added=${encodeURIComponent(displayName)}`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the contact.");
      setBusy(false);
    }
  };

  return (
    <main className="compass-main flex flex-col overflow-hidden bg-white text-[var(--ink)]">
      <form onSubmit={(event) => void save(event)} className="min-h-0 flex-1 overflow-y-auto px-[var(--gutter)] pb-[max(24px,env(safe-area-inset-bottom))]">
        <ScreenHeader title={editing ? "Edit" : "New contact"} fallbackHref={initial ? `/network/x/${initial.id}` : "/network"} />
        <div className="flex items-end gap-3">
          <PhotoSlotPicker
            photo={photo?.dataUrl ?? keptPhoto}
            onPhotoChange={(dataUrl, file) => {
              setPhoto(dataUrl && file ? { file, dataUrl } : null);
              setKeptPhoto(dataUrl ? keptPhoto : null);
              setPhotoId(null);
            }}
            sizePx={128}
            borderRadiusPx={0}
            photoLook="shadow"
            surfaceClassName="bg-white"
          />
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={keepEnter}
            placeholder="Name"
            aria-label="Name"
            autoComplete="name"
            className={cn(FIELD, "flex-1 text-[var(--ink)]")}
          />
        </div>

        <section className={SECTION}>
          <div className="min-w-0">
            <SectionNumber value="01" />
            <span className="mt-[6px] block t-label text-[var(--grey)]">Position</span>
          </div>
          <input
            value={position}
            onChange={(event) => setPosition(event.target.value)}
            onKeyDown={keepEnter}
            placeholder="What you do"
            aria-label="Position"
            className={cn(FIELD, "text-[var(--ink)]")}
          />
        </section>

        <section className={SECTION}>
          <div className="min-w-0">
            <SectionNumber value="02" />
            <span className="mt-[6px] block t-label text-[var(--grey)]">Company</span>
          </div>
          <input
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            onKeyDown={keepEnter}
            placeholder="Company or brand name"
            aria-label="Company"
            className={cn(FIELD, "text-[var(--ink)]")}
          />
        </section>

        <section className={SECTION}>
          <div className="min-w-0">
            <SectionNumber value="03" />
            <span className="mt-[6px] block t-label text-[var(--grey)]">Contacts</span>
          </div>
          <div className="flex min-w-0 flex-col gap-[14px]">
            {lines.map((line, index) => (
              <div key={line.id} className="flex min-w-0 items-center gap-3">
                <input
                  ref={index === lines.length - 1 ? lastLine : undefined}
                  value={line.value}
                  onChange={(event) => updateLine(line.id, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    if (!line.value.trim()) return;
                    if (index === lines.length - 1) {
                      setLines((current) => {
                        const last = current[current.length - 1];
                        if (!last?.value.trim()) return current;
                        return [...current, blank()];
                      });
                      window.setTimeout(() => lastLine.current?.focus(), 0);
                    }
                  }}
                  placeholder={line.value ? "" : "Phone, messenger, email, links"}
                  aria-label="Contact"
                  onBlur={() => {
                    if (index !== lines.length - 1 || !line.value.trim()) return;
                    setLines((current) => {
                      const last = current[current.length - 1];
                      if (!last?.value.trim()) return current;
                      return [...current, blank()];
                    });
                  }}
                  className={cn(FIELD, "flex-1", line.marked ? "text-[#E23B2F]" : "text-[var(--ink)]")}
                />
                {phoneLine(line.value) ? (
                  <span className="flex shrink-0 gap-2">
                    <FlagButton on={line.flags.includes("tg")} onPress={() => toggleFlag(line.id, "tg")}>
                      TG
                    </FlagButton>
                    <FlagButton on={line.flags.includes("wa")} onPress={() => toggleFlag(line.id, "wa")}>
                      WA
                    </FlagButton>
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <section className={SECTION}>
          <span className="t-label text-[var(--grey)]">Note</span>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            onKeyDown={keepEnter}
            aria-label="Note"
            className={cn(FIELD, "text-[var(--ink)]")}
          />
        </section>

        <section className={SECTION}>
          <span className="t-label text-[var(--grey)]">Event</span>
          <input
            value={eventTag}
            onChange={(event) => {
              setEventLive(true);
              setEventTag(event.target.value);
            }}
            onKeyDown={keepEnter}
            placeholder="#event"
            aria-label="Event"
            className={cn(FIELD, !eventLive && eventTag ? "text-[var(--grey)]" : "text-[var(--ink)]")}
          />
        </section>

        <div className="mt-[18px] flex gap-3">
          <button type="button" className={GHOST}>
            Scan
          </button>
          <button type="button" className={GHOST} onClick={() => lastLine.current?.focus()}>
            Voice
          </button>
        </div>
        <button type="submit" disabled={!ready} className={SAVE}>
          Save contact
        </button>
        {error ? <p className="mt-3 t-meta text-[#E23B2F]">{error}</p> : null}
      </form>
    </main>
  );
}

function FlagButton({ on, onPress, children }: { on: boolean; onPress: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onPress}
      className={cn("press border-0 bg-transparent p-0 t-label", on ? "text-[var(--ink)]" : "text-[var(--grey)]")}
    >
      {children}
    </button>
  );
}
