"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent } from "react";
import { useRouter } from "next/navigation";
import { Mic, Scan } from "lucide-react";
import { PhotoSlotPicker } from "@landing/components/photo-slot-picker";
import { TabBand } from "@main/components/tab-band";
import { cn } from "@/lib/utils";
import { HeroName } from "@/shared/components/hero-name";
import { PromoteArrow } from "@/shared/components/promote-arrow";
import { ScreenHeader } from "@/shared/components/screen-header";
import { SectionNumber } from "@/shared/components/section-number";
import { useKeyboardLift } from "@/shared/hooks/use-keyboard-lift";
import { uploadAttachment } from "@/shared/services/attachment-upload";
import { externalLineIsRed } from "@/features/contact-collect/lines";
import { QrScanner } from "@/features/contact-collect/qr-scanner";
import { isIntlPhone, polishContactLine } from "@/features/contact-collect/view-lines";
import type { ContactDraft } from "@/features/contact-collect/parse-contact";
import type { ScannedContact } from "@/features/contact-collect/scan-qr";
import type { ContactSource, ExternalContact, LineFlag } from "@/features/contact-collect/types";

const ROW = "grid grid-cols-[86px_minmax(0,1fr)] gap-x-[14px]";
const SECTION = `${ROW} items-start border-b border-[var(--rule)] py-[18px]`;
const COMPACT = `${ROW} items-start border-b border-[var(--rule)] py-[10px]`;
const COMPACT_EVENT = `${ROW} items-center border-b border-[var(--rule)] py-[10px]`;
const FIELD =
  "min-w-0 w-full border-0 bg-transparent py-1 t-body outline-none placeholder:text-[var(--placeholder)]";
const GHOST =
  "press min-h-11 flex-1 border-0 bg-white t-caps text-[var(--ink)] shadow-[0_10px_22px_rgba(20,20,20,0.14)] [-webkit-tap-highlight-color:transparent]";
const GHOST_CREATE =
  "press flex min-h-11 flex-1 items-center justify-center gap-2 border-0 bg-white t-caps text-[var(--ink)] shadow-[0_10px_22px_rgba(20,20,20,0.14)] [-webkit-tap-highlight-color:transparent]";
const SAVE =
  "press mt-[18px] w-full border-0 bg-sky px-6 py-3 t-caps text-[var(--ink)] shadow-none disabled:text-[var(--grey)] [-webkit-tap-highlight-color:transparent]";
const SAVE_BAND =
  "flex h-full min-h-11 items-center justify-center border-0 bg-transparent p-0 t-band uppercase disabled:text-[var(--grey)] [-webkit-tap-highlight-color:transparent]";
type Line = { id: string; value: string; flags: LineFlag[]; marked: boolean };
/** Which section value sits under the name. Not persisted until header_field ships. */
type HeaderField = "position" | "company" | null;

function blank(): Line {
  return { id: crypto.randomUUID(), value: "", flags: [], marked: false };
}

function linesFrom(initial?: ExternalContact): Line[] {
  if (!initial || initial.lines.length === 0) return [blank()];
  return [
    ...initial.lines.map((line) => ({
      id: crypto.randomUUID(),
      value: polishContactLine(line.value) || line.value,
      flags: line.flags ? [...line.flags] : [],
      marked: false,
    })),
    blank(),
  ];
}

function keepEnter(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
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
  const [headerField, setHeaderField] = useState<HeaderField>(null);
  const [note, setNote] = useState(initial?.note ?? "");
  const [eventTag, setEventTag] = useState(editing ? (initial?.eventTag ?? "") : suggestedEvent);
  const [eventLive, setEventLive] = useState(editing);
  const [lines, setLines] = useState<Line[]>(() => linesFrom(initial));
  const [photo, setPhoto] = useState<{ file: File; dataUrl: string } | null>(null);
  const [keptPhoto, setKeptPhoto] = useState<string | null>(initial?.photoUrl ?? null);
  const [photoId, setPhotoId] = useState<string | null>(initial?.photoAttachmentId ?? null);
  const [source, setSource] = useState<ContactSource>(initial?.source ?? "manual");
  const [scanning, setScanning] = useState(false);
  const [canRead, setCanRead] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canReadRef = useRef(false);
  const voiceRef = useRef<{ released: boolean; recorder: MediaRecorder | null; started: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useKeyboardLift(scrollRef);

  const ready = name.trim().length > 0 && !busy && !reading;
  const headerTitle =
    headerField === "position" && position.trim()
      ? position.trim()
      : headerField === "company" && company.trim()
        ? company.trim()
        : "";

  const pickHeader = (field: "position" | "company") => {
    const value = field === "position" ? position.trim() : company.trim();
    if (!value) return;
    setHeaderField((current) => (current === field ? null : field));
  };

  useEffect(() => {
    canReadRef.current = canRead;
  }, [canRead]);

  useEffect(() => {
    let gone = false;
    void fetch("/api/external-contacts/parse", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { available?: boolean } | null) => {
        if (!gone && body?.available === true) setCanRead(true);
      })
      .catch(() => undefined);
    return () => {
      gone = true;
    };
  }, []);

  const updateLine = (id: string, value: string) => {
    setLines((current) => current.map((line) => (line.id === id ? { ...line, value, marked: false } : line)));
  };

  const commitLine = (id: string, raw: string, andNext: boolean) => {
    const polished = polishContactLine(raw);
    setLines((current) => {
      const next = current.map((line) => (line.id === id ? { ...line, value: polished, marked: false } : line));
      if (!andNext || !polished) return next;
      const index = next.findIndex((line) => line.id === id);
      if (index === next.length - 1) return [...next, blank()];
      return next;
    });
    if (andNext && polished) window.setTimeout(() => lastLine.current?.focus(), 0);
  };

  const applyScan = (found: ScannedContact) => {
    if (!initial) setSource("scan");
    if (found.name && !name.trim()) setName(found.name);
    if (found.lines.length === 0) return;
    setLines((current) => {
      const next = current.filter((line) => line.value.trim());
      for (const value of found.lines) {
        if (next.length >= 30) break;
        if (next.some((line) => line.value.trim() === value)) continue;
        next.push({ id: crypto.randomUUID(), value, flags: [], marked: false });
      }
      next.push(blank());
      return next;
    });
  };

  const applyDraft = (draft: ContactDraft, kind: "voice" | "photo") => {
    const has = Boolean(draft.displayName || draft.position || draft.company || draft.note || draft.lines.length);
    if (!has) {
      if (kind === "voice") setError("Could not hear that.");
      return;
    }
    setError(null);
    if (!initial) setSource(kind);
    if (draft.displayName && !name.trim()) setName(draft.displayName);
    if (draft.position && !position.trim()) setPosition(draft.position);
    if (draft.company && !company.trim()) setCompany(draft.company);
    if (draft.note && !note.trim()) setNote(draft.note);
    if (draft.lines.length === 0) return;
    setLines((current) => {
      const next = current.filter((line) => line.value.trim());
      for (const value of draft.lines) {
        if (next.length >= 30) break;
        if (next.some((line) => line.value.trim() === value)) continue;
        next.push({ id: crypto.randomUUID(), value, flags: [], marked: false });
      }
      next.push(blank());
      return next;
    });
  };

  const readFile = async (field: "image" | "audio", file: Blob, filename: string) => {
    setReading(true);
    setError(null);
    try {
      const body = new FormData();
      body.set(field, file, filename);
      const response = await fetch("/api/external-contacts/parse", { method: "POST", body });
      const payload = (await response.json().catch(() => null)) as { error?: string; draft?: ContactDraft } | null;
      if (!response.ok || !payload?.draft) {
        setError(payload?.error || (field === "audio" ? "Could not hear that." : "Could not read that."));
        return;
      }
      applyDraft(payload.draft, field === "audio" ? "voice" : "photo");
    } catch {
      setError(field === "audio" ? "Could not hear that." : "Could not read that.");
    } finally {
      setReading(false);
    }
  };

  const beginVoice = (event: PointerEvent<HTMLButtonElement>) => {
    if (!canReadRef.current || reading) return;
    event.preventDefault();
    const session = { released: false, recorder: null as MediaRecorder | null, started: 0 };
    voiceRef.current = session;
    let done = false;
    const stop = () => {
      if (done) return;
      done = true;
      session.released = true;
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      const recorder = session.recorder;
      if (!recorder) {
        lastLine.current?.focus();
        return;
      }
      if (recorder.state !== "inactive") recorder.stop();
    };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (session.released || voiceRef.current !== session) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const mime = MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : MediaRecorder.isTypeSupported("audio/mp4")
            ? "audio/mp4"
            : "";
        const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        const chunks: Blob[] = [];
        recorder.ondataavailable = (item) => {
          if (item.data.size) chunks.push(item.data);
        };
        recorder.onstop = () => {
          stream.getTracks().forEach((track) => track.stop());
          const held = Date.now() - session.started;
          if (held < 280 || chunks.length === 0) {
            lastLine.current?.focus();
            return;
          }
          const type = recorder.mimeType || mime || "audio/webm";
          const extension = type.includes("mp4") ? "mp4" : "webm";
          void readFile("audio", new Blob(chunks, { type }), `recording.${extension}`);
        };
        session.recorder = recorder;
        session.started = Date.now();
        recorder.start();
      } catch {
        if (!session.released) lastLine.current?.focus();
      }
    })();
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
          source: initial?.source ?? source,
          photoAttachmentId,
          lines: filled.map((line) => {
            const value = polishContactLine(line.value) || line.value.trim();
            const flags = isIntlPhone(value) ? line.flags : [];
            return flags.length > 0 ? { value, flags } : { value };
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

  const sectionClass = SECTION;
  const contactHint = "Phone, @nick, email, link";
  const positionHint = editing ? "What you do" : "Role";

  const photoName = (
    <div className="pt-[18px]">
      <div className="flex items-stretch gap-3" style={{ height: 128 }}>
        <PhotoSlotPicker
          photo={photo?.dataUrl ?? keptPhoto}
          onPhotoChange={(dataUrl, file) => {
            setPhoto(dataUrl && file ? { file, dataUrl } : null);
            setKeptPhoto(dataUrl ? keptPhoto : null);
            setPhotoId(null);
            if (file && canReadRef.current) void readFile("image", file, file.name || "card.jpg");
          }}
          sizePx={128}
          borderRadiusPx={0}
          photoLook="shadow"
          surfaceClassName="bg-white"
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-end">
          <HeroName
            value={name}
            onChange={setName}
            placeholder="Name"
            roleBelow={Boolean(headerTitle)}
          />
          {headerTitle ? (
            <p className="m-0 t-label uppercase text-[var(--grey)]">{headerTitle}</p>
          ) : null}
        </div>
      </div>
    </div>
  );

  const contactLines = (
    <div className="flex min-w-0 flex-col gap-[14px]">
      {lines.map((line, index) => (
        <div key={line.id} className="flex min-w-0 flex-col gap-2">
          <input
            ref={index === lines.length - 1 ? lastLine : undefined}
            value={line.value}
            onChange={(event) => {
              const next = event.target.value;
              if (next.includes(",")) {
                const [head, ...tail] = next.split(",");
                const rest = tail.join(",").trim();
                commitLine(line.id, head ?? "", true);
                if (rest) {
                  window.setTimeout(() => {
                    setLines((current) => {
                      const last = current[current.length - 1];
                      if (!last || last.value.trim()) return current;
                      return current.map((row) => (row.id === last.id ? { ...row, value: rest } : row));
                    });
                  }, 0);
                }
                return;
              }
              updateLine(line.id, next);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              if (!line.value.trim()) return;
              commitLine(line.id, line.value, true);
            }}
            placeholder={line.value ? "" : contactHint}
            aria-label="Contact"
            onBlur={() => {
              if (!line.value.trim()) return;
              commitLine(line.id, line.value, index === lines.length - 1);
            }}
            className={cn(FIELD, "flex-1", line.marked ? "text-[#E23B2F]" : "text-[var(--ink)]")}
          />
          {isIntlPhone(line.value) ? (
            <div className="flex flex-wrap gap-2">
              <FlagButton on={line.flags.includes("wa")} onPress={() => toggleFlag(line.id, "wa")}>
                WhatsApp
              </FlagButton>
              <FlagButton on={line.flags.includes("tg")} onPress={() => toggleFlag(line.id, "tg")}>
                Telegram
              </FlagButton>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );

  const fields = (
    <>
      {photoName}
      <section className={sectionClass}>
        <div className="min-w-0">
          <SectionNumber value="01" />
          <button
            type="button"
            className="mt-[6px] block w-full bg-transparent p-0 text-left t-label text-[var(--grey)]"
            onClick={() => pickHeader("position")}
          >
            <span className="relative inline-block max-w-full">
              Position
              {position.trim() ? <PromoteArrow /> : null}
            </span>
          </button>
        </div>
        <input
          value={position}
          onChange={(event) => {
            const next = event.target.value;
            setPosition(next);
            if (!next.trim() && headerField === "position") setHeaderField(null);
          }}
          onKeyDown={keepEnter}
          placeholder={positionHint}
          aria-label="Position"
          className={cn(FIELD, "text-[var(--ink)]")}
        />
      </section>
      <section className={sectionClass}>
        <div className="min-w-0">
          <SectionNumber value="02" />
          <button
            type="button"
            className="mt-[6px] block w-full bg-transparent p-0 text-left t-label text-[var(--grey)]"
            onClick={() => pickHeader("company")}
          >
            <span className="relative inline-block max-w-full">
              Company
              {company.trim() ? <PromoteArrow /> : null}
            </span>
          </button>
        </div>
        <input
          value={company}
          onChange={(event) => {
            const next = event.target.value;
            setCompany(next);
            if (!next.trim() && headerField === "company") setHeaderField(null);
          }}
          onKeyDown={keepEnter}
          placeholder="Company or brand name"
          aria-label="Company"
          className={cn(FIELD, "text-[var(--ink)]")}
        />
      </section>
      <section className={sectionClass}>
        <div className="min-w-0">
          <SectionNumber value="03" />
          <span className="mt-[6px] block t-label text-[var(--grey)]">Contacts</span>
        </div>
        {contactLines}
      </section>
      <section className={COMPACT}>
        <span className="t-label text-[var(--grey)]">Note</span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          placeholder="short text"
          aria-label="Note"
          className={cn(FIELD, "resize-none text-[var(--ink)]")}
        />
      </section>
      <section className={COMPACT_EVENT}>
        <span className="t-label text-[var(--grey)]">Event</span>
        <input
          value={eventTag}
          onChange={(event) => {
            setEventLive(true);
            setEventTag(event.target.value);
          }}
          onKeyDown={keepEnter}
          placeholder="/event"
          aria-label="Event"
          className={cn(FIELD, !eventLive && eventTag ? "text-[var(--grey)]" : "text-[var(--ink)]")}
        />
      </section>
      <div className="mt-[18px] flex gap-3">
        <button type="button" className={editing ? GHOST : GHOST_CREATE} onClick={() => setScanning(true)}>
          {editing ? null : <Scan className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />}
          Scan
        </button>
        <button
          type="button"
          className={editing ? GHOST : GHOST_CREATE}
          onPointerDown={beginVoice}
          onClick={() => {
            if (!canRead) lastLine.current?.focus();
          }}
          onContextMenu={(event) => event.preventDefault()}
        >
          {editing ? null : <Mic className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />}
          Voice
        </button>
      </div>
      {error ? <p className="mt-3 t-meta text-[#E23B2F]">{error}</p> : null}
    </>
  );

  if (editing) {
    return (
      <main className="compass-main flex flex-col overflow-hidden bg-white text-[var(--ink)]">
        <form
          onSubmit={(event) => void save(event)}
          className="min-h-0 flex-1 overflow-y-auto px-[var(--gutter)] pb-[max(24px,env(safe-area-inset-bottom))]"
        >
          <ScreenHeader title="Edit" fallbackHref={`/network/x/${initial!.id}`} />
          {fields}
          <button type="submit" disabled={!ready} className={SAVE}>
            Save contact
          </button>
        </form>
        {scanning ? (
          <QrScanner
            onClose={() => setScanning(false)}
            onScan={(found) => {
              applyScan(found);
              setScanning(false);
            }}
          />
        ) : null}
      </main>
    );
  }

  return (
    <main className="compass-main flex h-dvh flex-col overflow-hidden bg-white text-[var(--ink)]">
      <form onSubmit={(event) => void save(event)} className="flex min-h-0 flex-1 flex-col">
        <ScreenHeader title="New contact" fallbackHref="/network" />
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-[var(--gutter)]"
        >
          <div className="min-h-[calc(100%+1px)] pb-6">{fields}</div>
        </div>
        <TabBand
          label="Save"
          left={<span aria-hidden className="block w-px" />}
          right={<span aria-hidden className="block w-px" />}
          center={
            <button type="submit" disabled={!ready} className={SAVE_BAND}>
              Save
            </button>
          }
        />
      </form>
      {scanning ? (
        <QrScanner
          onClose={() => setScanning(false)}
          onScan={(found) => {
            applyScan(found);
            setScanning(false);
          }}
        />
      ) : null}
    </main>
  );
}

function FlagButton({ on, onPress, children }: { on: boolean; onPress: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onPress}
      className={cn(
        "press min-h-8 border-0 px-3 py-1.5 t-label text-[var(--ink)] [-webkit-tap-highlight-color:transparent]",
        on ? "bg-sky shadow-none" : "bg-white shadow-[0_2px_8px_rgba(17,17,17,0.16)]",
      )}
    >
      {children}
    </button>
  );
}
