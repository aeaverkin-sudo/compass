"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, FileText, Mic, Scan, X } from "lucide-react";
import { openContactAttachmentPicker } from "@landing/components/photo-input-utils";
import { MarkPlus } from "@/shared/components/mark-plus";
import { PhotoSlotPicker } from "@landing/components/photo-slot-picker";
import { TabBand } from "@main/components/tab-band";
import { cn } from "@/lib/utils";
import { HeroName } from "@/shared/components/hero-name";
import { clampNameLines } from "@/shared/components/name-or-title-field";
import { PromoteArrow } from "@/shared/components/promote-arrow";
import { ScreenHeader } from "@/shared/components/screen-header";
import { SectionNumber } from "@/shared/components/section-number";
import { useKeyboardLift } from "@/shared/hooks/use-keyboard-lift";
import { photoFileFromDraft } from "@/shared/lib/fill-place";
import { prepareCardPhotoForStorage } from "@/shared/services/attachment-storage";
import { uploadAttachment } from "@/shared/services/attachment-upload";
import { entryLineIsRed } from "@/shared/services/entry-line";
import { detectAttachmentType } from "@/shared/services/portfolio-catalog";
import { joinAbout } from "@/features/contact-collect/about-text";
import {
  aboutSave,
  CONTACT_FILE_LIMIT,
  CONTACT_LINK_LIMIT,
  CONTACT_LINK_MAX,
} from "@/features/contact-collect/contact-files";
import {
  clearContactDraft,
  contactDraftIsEmpty,
  readContactDraft,
  writeContactDraft,
  type ContactDraftRecord,
} from "@/features/contact-collect/new-contact-draft";
import { externalLineIsRed } from "@/features/contact-collect/lines";
import { QrScanner } from "@/features/contact-collect/qr-scanner";
import { isIntlPhone, polishContactLine, telegramNickOf } from "@/features/contact-collect/view-lines";
import { detectContactType } from "@/shared/services/contact-item";
import {
  mergeContactDraft,
  patchFromContactDraft,
  patchFromScan,
  patchHasContent,
  type ContactDraftPatch,
} from "@/features/contact-collect/merge-contact-draft";
import type { ContactReading } from "@/features/contact-collect/parse-contact";
import { scanTextNeedsEnglish, type ScannedContact } from "@/features/contact-collect/scan-qr";
import type { ContactFileRef, ContactLink, ContactSource, ExternalContact, HeaderField, LineFlag } from "@/features/contact-collect/types";

const ROW = "grid grid-cols-[86px_minmax(0,1fr)] gap-x-[14px]";
const SECTION = `${ROW} items-start border-b border-[var(--rule)] py-[18px]`;
const COMPACT = `${ROW} items-center border-b border-[var(--rule)] py-[10px]`;
const FIELD =
  "min-w-0 w-full border-0 bg-transparent py-1 t-body outline-none placeholder:text-[var(--placeholder)]";

/** One `t-body` line. The empty Name caret sits on this hint. */
const NAME_HINT_LINE_PX = 15.5 * 1.45;

/** New contact stays one line until wrap, then grows to two. Edit grows to the whole text. */
function fitNoteField(node: HTMLTextAreaElement, limited: boolean) {
  node.style.height = "0px";
  const styles = getComputedStyle(node);
  const line = Number.parseFloat(styles.lineHeight) || 22;
  const pad =
    (Number.parseFloat(styles.paddingTop) || 0) + (Number.parseFloat(styles.paddingBottom) || 0);
  const max = line * 2 + pad;
  const next = limited ? Math.min(node.scrollHeight, max) : node.scrollHeight;
  node.style.height = `${next}px`;
  node.style.overflowY = limited && node.scrollHeight > max + 1 ? "auto" : "hidden";
}
const GHOST_CREATE =
  "press flex min-h-11 flex-1 items-center justify-center gap-2 border-0 bg-white t-caps text-[var(--ink)] shadow-[0_10px_22px_rgba(20,20,20,0.14)] [-webkit-tap-highlight-color:transparent]";
const SAVE_BAND =
  "flex h-full min-h-11 items-center justify-center border-0 bg-transparent p-0 t-band uppercase disabled:text-[var(--grey)] [-webkit-tap-highlight-color:transparent]";
type Line = { id: string; value: string; flags: LineFlag[]; marked: boolean };
type VoicePhase = "idle" | "recording" | "processing";
type VoiceRun = {
  released: boolean;
  dropped: boolean;
  recorder: MediaRecorder | null;
  stream: MediaStream | null;
  started: number;
};
type LinkDraft = { id: string; value: string; marked: boolean };

function linkDrafts(links: ContactLink[] | undefined): LinkDraft[] {
  const rows = (links ?? [])
    .filter((link) => link.value.trim())
    .map((link) => ({ id: crypto.randomUUID(), value: link.value, marked: false }));
  if (rows.length >= CONTACT_LINK_LIMIT) return rows;
  return [...rows, { id: crypto.randomUUID(), value: "", marked: false }];
}

function storedExtras(contact?: ExternalContact) {
  if (!contact) return false;
  return (
    contact.web.some((link) => link.value.trim()) ||
    contact.social.some((link) => link.value.trim()) ||
    contact.about.trim().length > 0 ||
    contact.files.length > 0
  );
}

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

function detectContactPhone(value: string) {
  return detectContactType(value, "contact") === "phone";
}

/** What the empty contact row still asks for. A filled kind drops out and comes back when cleared. */
function contactPlaceholder(hasPhone: boolean, hasNick: boolean, hasEmail: boolean) {
  const parts: string[] = [];
  if (!hasPhone) parts.push("Phone");
  if (!hasNick) parts.push("@nick");
  if (!hasEmail) parts.push("email");
  if (hasPhone || hasNick || hasEmail) parts.push("link", "social");
  if (parts.length === 0) return "Link, social";
  parts[0] = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  return parts.join(", ");
}

function LinkRows({
  rows,
  zone,
  placeholder,
  onChange,
}: {
  rows: LinkDraft[];
  zone: "web" | "social";
  placeholder: string;
  onChange: (rows: LinkDraft[]) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-[14px]">
      {rows.map((row, index) => (
        <input
          key={row.id}
          value={row.value}
          placeholder={row.value ? "" : placeholder}
          aria-label={placeholder}
          onChange={(event) => {
            const value = event.target.value;
            onChange(rows.map((item) => (item.id === row.id ? { ...item, value, marked: false } : item)));
          }}
          onBlur={() => {
            const text = row.value.trim();
            let next = rows.map((item) =>
              item.id === row.id
                ? {
                    ...item,
                    value: text,
                    marked: Boolean(text) && (entryLineIsRed(zone, text) || text.length > CONTACT_LINK_MAX),
                  }
                : item,
            );
            const filled = next.filter((item) => item.value.trim()).length;
            const last = next[next.length - 1];
            if (text && index === rows.length - 1 && filled < CONTACT_LINK_LIMIT && last?.value.trim()) {
              next = [...next, { id: crypto.randomUUID(), value: "", marked: false }];
            }
            onChange(next);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            event.currentTarget.blur();
          }}
          className={cn(FIELD, row.marked ? "text-[#E23B2F]" : "text-[var(--ink)]")}
        />
      ))}
    </div>
  );
}

function MoreRow({ open, hint, onToggle }: { open: boolean; hint: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      className="grid w-full grid-cols-[86px_minmax(0,1fr)] items-center gap-x-[14px] border-0 bg-transparent p-0 py-[18px] text-left"
      onClick={onToggle}
    >
      <span className="t-label">More</span>
      <span className="flex min-w-0 items-center gap-3">
        {open ? (
          <span className="min-w-0 flex-1" />
        ) : (
          <span className="t-body min-w-0 flex-1 text-[var(--placeholder)]">{hint}</span>
        )}
        <ChevronDown className={cn("size-4 shrink-0 text-[var(--ink)]", open && "rotate-180")} strokeWidth={1.5} aria-hidden />
      </span>
    </button>
  );
}

function keepEnter(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
  if (event.key !== "Enter") return;
  event.preventDefault();
}

export function NewContactForm({
  suggestedEvent,
  initial,
  ownerId,
}: {
  suggestedEvent: string;
  initial?: ExternalContact;
  /** Confirmed account. New contact keeps one local draft under this id. */
  ownerId?: string;
}) {
  const router = useRouter();
  const editing = Boolean(initial);
  const storedNote = initial?.note ?? "";
  const storedAbout = initial?.about ?? "";
  const storedAboutText = joinAbout(storedNote, storedAbout);
  const lastLine = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const aboutEdited = useRef(false);
  const [name, setName] = useState(clampNameLines(initial?.displayName ?? ""));
  const [position, setPosition] = useState(initial?.position ?? "");
  const [company, setCompany] = useState(initial?.company ?? "");
  const [headerField, setHeaderField] = useState<HeaderField | null>(initial?.headerField ?? null);
  const [note, setNote] = useState(editing ? storedAboutText : "");
  const keepExtras = useRef(storedExtras(initial));
  const [webLinks, setWebLinks] = useState<LinkDraft[]>(() => linkDrafts(initial?.web));
  const [socialLinks, setSocialLinks] = useState<LinkDraft[]>(() => linkDrafts(initial?.social));
  const [contactFiles, setContactFiles] = useState<ContactFileRef[]>(() => initial?.files ?? []);
  const [moreOpen, setMoreOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lines, setLines] = useState<Line[]>(() => linesFrom(initial));
  const [photo, setPhoto] = useState<{ file: File; dataUrl: string } | null>(null);
  const [draftPhoto, setDraftPhoto] = useState<string | null>(null);
  const [keptPhoto, setKeptPhoto] = useState<string | null>(initial?.photoUrl ?? null);
  const [photoId, setPhotoId] = useState<string | null>(initial?.photoAttachmentId ?? null);
  const [source, setSource] = useState<ContactSource>(initial?.source ?? "manual");
  const [scanning, setScanning] = useState(false);
  const [canRead, setCanRead] = useState(false);
  const [reading, setReading] = useState(false);
  const [voicePhase, setVoicePhaseState] = useState<VoicePhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [hearTick, setHearTick] = useState(0);
  const [armedDelete, setArmedDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const canReadRef = useRef(false);
  const readingRef = useRef(false);
  const voicePhaseRef = useRef<VoicePhase>("idle");
  const voiceRef = useRef<VoiceRun | null>(null);
  const stopVoiceRef = useRef<(() => void) | null>(null);
  const setVoicePhase = (phase: VoicePhase) => {
    voicePhaseRef.current = phase;
    setVoicePhaseState(phase);
  };
  readingRef.current = reading;
  const scrollRef = useRef<HTMLDivElement>(null);
  const photoTicket = useRef(0);
  const persistDraftRef = useRef(true);
  const [draftReady, setDraftReady] = useState(false);
  const draftRef = useRef({ name, position, company, note, lines });
  draftRef.current = { name, position, company, note, lines };
  const draftRecord = useMemo<ContactDraftRecord>(() => {
    const linesKept = lines
      .filter((line) => line.value.trim())
      .map((line) => ({
        value: line.value,
        flags: line.flags.filter((flag): flag is "wa" | "tg" => flag === "wa" || flag === "tg"),
      }));
    return {
      name,
      position,
      company,
      headerField:
        headerField === "position" && position.trim()
          ? "position"
          : headerField === "company" && company.trim()
            ? "company"
            : null,
      note,
      lines: linesKept,
      photo: draftPhoto,
      source,
    };
  }, [name, position, company, headerField, note, lines, draftPhoto, source]);
  const draftRecordRef = useRef(draftRecord);
  draftRecordRef.current = draftRecord;
  useKeyboardLift(scrollRef);

  useEffect(() => {
    if (noteRef.current) fitNoteField(noteRef.current, !editing);
  }, [note, editing]);

  const writeNote = (value: string) => {
    setNote(value);
    if (editing) aboutEdited.current = value.trim() !== storedAboutText.trim();
  };

  useEffect(() => {
    if (error !== "Try again") return;
    const timer = window.setTimeout(() => {
      setError((current) => (current === "Try again" ? null : current));
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [error, hearTick]);

  const ready = name.trim().length > 0 && !busy && !reading && !uploading;
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
    if (editing || !ownerId) {
      setDraftReady(true);
      return;
    }
    const stored = readContactDraft(ownerId);
    if (stored) {
      setName(clampNameLines(stored.name));
      setPosition(stored.position);
      setCompany(stored.company);
      setHeaderField(stored.headerField);
      setNote(stored.note);
      setSource(stored.source);
      setLines(
        stored.lines.length === 0
          ? [blank()]
          : [
              ...stored.lines.map((line) => ({
                id: crypto.randomUUID(),
                value: line.value,
                flags: line.flags,
                marked: false,
              })),
              blank(),
            ],
      );
      const file = stored.photo ? photoFileFromDraft(stored.photo) : null;
      if (stored.photo && file) {
        setPhoto({ file, dataUrl: stored.photo });
        setKeptPhoto(stored.photo);
        setDraftPhoto(stored.photo);
      }
    }
    setDraftReady(true);
  }, [editing, ownerId]);

  useEffect(() => {
    if (!draftReady || editing || !ownerId) return;
    const flush = () => {
      if (!persistDraftRef.current) return;
      const record = draftRecordRef.current;
      if (contactDraftIsEmpty(record)) clearContactDraft(ownerId);
      else writeContactDraft(ownerId, record);
    };
    flush();
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [draftReady, editing, ownerId, draftRecord]);

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

  const applyPatch = (patch: ContactDraftPatch) => {
    const current = draftRef.current;
    const merged = mergeContactDraft(
      {
        displayName: current.name,
        position: current.position,
        company: current.company,
        note: current.note,
        lines: current.lines
          .filter((line) => line.value.trim())
          .map((line) => ({ id: line.id, value: line.value, flags: line.flags })),
      },
      patch,
    );
    const displayName = clampNameLines(merged.displayName);
    setName(displayName);
    setPosition(merged.position);
    setCompany(merged.company);
    writeNote(merged.note);
    setLines([...merged.lines.map((line) => ({ ...line, marked: false })), blank()]);
    draftRef.current = {
      name: displayName,
      position: merged.position,
      company: merged.company,
      note: merged.note,
      lines: [...merged.lines.map((line) => ({ ...line, marked: false })), blank()],
    };
  };

  const applyScan = (found: ScannedContact) => {
    if (!initial) setSource("scan");
    const foreign = [found.name, found.position, found.company, found.note].some(
      (value) => Boolean(value && scanTextNeedsEnglish(value)),
    );
    if (!foreign || !canReadRef.current) {
      applyPatch(patchFromScan(found));
      return;
    }
    applyPatch(
      patchFromScan({
        ...found,
        name: found.name && scanTextNeedsEnglish(found.name) ? "" : found.name,
        position: found.position && scanTextNeedsEnglish(found.position) ? "" : found.position,
        company: found.company && scanTextNeedsEnglish(found.company) ? "" : found.company,
        note: found.note && scanTextNeedsEnglish(found.note) ? "" : found.note,
      }),
    );
    void translateScan(found);
  };

  const translateScan = async (found: ScannedContact) => {
    const text = [
      found.name ? `Name: ${found.name}` : "",
      found.position ? `Position: ${found.position}` : "",
      found.company ? `Company: ${found.company}` : "",
      found.note ? `Note: ${found.note}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    setReading(true);
    setError(null);
    try {
      const response = await fetch("/api/external-contacts/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const payload = (await response.json().catch(() => null)) as { draft?: ContactReading } | null;
      if (!response.ok || !payload?.draft) {
        applyPatch(patchFromScan(found));
        return;
      }
      const patch = patchFromContactDraft(payload.draft, { allowSets: false });
      applyPatch({
        fills: {
          displayName: patch.fills?.displayName,
          position: patch.fills?.position,
          company: patch.fills?.company,
          note: patch.fills?.note,
        },
      });
    } catch {
      applyPatch(patchFromScan(found));
    } finally {
      setReading(false);
    }
  };

  const missHeard = () => {
    setError("Try again");
    setHearTick((tick) => tick + 1);
  };

  const applyDraft = (draft: ContactReading, kind: "voice" | "photo") => {
    const patch = patchFromContactDraft(draft, { allowSets: kind === "voice" });
    if (!patchHasContent(patch)) {
      if (kind === "voice") missHeard();
      return;
    }
    setError(null);
    if (!initial) setSource(kind);
    applyPatch(patch);
  };

  const readFile = async (field: "image" | "audio", file: Blob, filename: string) => {
    setReading(true);
    setError(null);
    try {
      const body = new FormData();
      body.set(field, file, filename);
      const response = await fetch("/api/external-contacts/parse", { method: "POST", body });
      const payload = (await response.json().catch(() => null)) as { error?: string; draft?: ContactReading } | null;
      if (!response.ok || !payload?.draft) {
        if (field === "audio" && !payload?.error) missHeard();
        else setError(payload?.error || "Could not read that.");
        return;
      }
      applyDraft(payload.draft, field === "audio" ? "voice" : "photo");
    } catch {
      if (field === "audio") missHeard();
      else setError("Could not read that.");
    } finally {
      setReading(false);
      if (field === "audio") setVoicePhase("idle");
    }
  };

  const beginVoice = (event: PointerEvent<HTMLButtonElement>) => {
    if (!canReadRef.current) return;
    if (readingRef.current || voicePhaseRef.current !== "idle") {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    const session: VoiceRun = {
      released: false,
      dropped: false,
      recorder: null,
      stream: null,
      started: 0,
    };
    voiceRef.current = session;
    let done = false;
    const stop = () => {
      if (done) return;
      done = true;
      if (stopVoiceRef.current === stop) stopVoiceRef.current = null;
      session.released = true;
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      const recorder = session.recorder;
      if (!recorder) {
        if (!session.dropped) lastLine.current?.focus();
        return;
      }
      if (recorder.state !== "inactive") recorder.stop();
    };
    stopVoiceRef.current = stop;
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    void (async () => {
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (session.released || session.dropped || voiceRef.current !== session) {
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
          stream?.getTracks().forEach((track) => track.stop());
          if (session.dropped) {
            setVoicePhase("idle");
            return;
          }
          const held = Date.now() - session.started;
          if (held < 280 || chunks.length === 0) {
            setVoicePhase("idle");
            lastLine.current?.focus();
            return;
          }
          setVoicePhase("processing");
          const type = recorder.mimeType || mime || "audio/webm";
          const extension = type.includes("mp4") ? "mp4" : "webm";
          void readFile("audio", new Blob(chunks, { type }), `recording.${extension}`);
        };
        session.recorder = recorder;
        session.stream = stream;
        session.started = Date.now();
        recorder.start();
        if (session.released || session.dropped || voiceRef.current !== session) {
          if (recorder.state !== "inactive") recorder.stop();
          return;
        }
        setVoicePhase("recording");
      } catch {
        stream?.getTracks().forEach((track) => track.stop());
        if (session.dropped) return;
        setVoicePhase("idle");
        setError("Microphone is unavailable.");
      }
    })();
  };

  useEffect(() => {
    return () => {
      const session = voiceRef.current;
      if (session) session.dropped = true;
      stopVoiceRef.current?.();
      session?.stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

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
    if (!displayName || busy || uploading) return;
    const formHasExtras =
      webLinks.some((row) => row.value.trim()) ||
      socialLinks.some((row) => row.value.trim()) ||
      contactFiles.length > 0;
    const written = aboutSave({
      editing,
      changed: aboutEdited.current,
      text: note,
      storedNote,
    });
    if (!written.ok) {
      setError(written.error);
      return;
    }
    const sendSections = editing && (keepExtras.current || formHasExtras);
    const markLinks = (rows: LinkDraft[], zone: "web" | "social") =>
      rows.map((row) => {
        const text = row.value.trim();
        return {
          ...row,
          value: text,
          marked: Boolean(text) && (entryLineIsRed(zone, text) || text.length > CONTACT_LINK_MAX),
        };
      });
    const nextWeb = markLinks(webLinks, "web");
    const nextSocial = markLinks(socialLinks, "social");
    if (sendSections && (nextWeb.some((row) => row.marked) || nextSocial.some((row) => row.marked))) {
      setWebLinks(nextWeb);
      setSocialLinks(nextSocial);
      setError("One link is not valid.");
      return;
    }
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
          headerField:
            headerField === "position" && position.trim()
              ? "position"
              : headerField === "company" && company.trim()
                ? "company"
                : null,
          note: written.note,
          eventTag: editing ? (initial?.eventTag ?? "") : suggestedEvent,
          source: initial?.source ?? source,
          photoAttachmentId,
          ...(written.about !== undefined ? { about: written.about } : {}),
          ...(sendSections
            ? {
                web: nextWeb.filter((row) => row.value).map((row) => ({ value: row.value, type: "" })),
                social: nextSocial.filter((row) => row.value).map((row) => ({ value: row.value, type: "" })),
                files: contactFiles,
              }
            : {}),
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
      if (!initial && ownerId) {
        persistDraftRef.current = false;
        clearContactDraft(ownerId);
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

  const formDirty =
    Boolean(name.trim() || position.trim() || company.trim() || note.trim() || photo || draftPhoto || keptPhoto) ||
    lines.some((line) => line.value.trim());

  const resetForm = () => {
    photoTicket.current += 1;
    draftRecordRef.current = {
      name: "",
      position: "",
      company: "",
      headerField: null,
      note: "",
      lines: [],
      photo: null,
      source: "manual",
    };
    setName("");
    setPosition("");
    setCompany("");
    setHeaderField(null);
    setNote("");
    setLines([blank()]);
    setSource("manual");
    setPhoto(null);
    setKeptPhoto(null);
    setPhotoId(null);
    setDraftPhoto(null);
    setError(null);
    if (ownerId) clearContactDraft(ownerId);
  };

  const removeContact = async () => {
    if (!initial || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/external-contacts/${initial.id}`, { method: "DELETE" });
      if (!response.ok) {
        setError("Could not delete the contact.");
        setBusy(false);
        setArmedDelete(false);
        return;
      }
      router.replace("/network");
    } catch {
      setError("Could not delete the contact.");
      setBusy(false);
      setArmedDelete(false);
    }
  };

  const sectionClass = SECTION;
  const hasPhone = lines.some((line) => isIntlPhone(line.value) || detectContactPhone(line.value));
  const hasNick = lines.some((line) => {
    if (detectContactType(line.value, "contact") !== "telegram") return false;
    return Boolean(telegramNickOf(line.value));
  });
  const hasEmail = lines.some((line) => detectContactType(line.value, "contact") === "email");
  const contactHint = contactPlaceholder(hasPhone, hasNick, hasEmail);
  const positionHint = editing ? "What you do" : "Role";
  const pickFile = () => {
    if (!initial || uploading || contactFiles.length >= CONTACT_FILE_LIMIT) return;
    openContactAttachmentPicker((_dataUrl, file) => {
      if (!file) return;
      const kind = detectAttachmentType(file);
      setUploading(true);
      setError(null);
      void uploadAttachment({ file, kind, contactId: initial.id })
        .then((readyFile) => {
          setContactFiles((current) => {
            if (current.some((item) => item.id === readyFile.attachmentId) || current.length >= CONTACT_FILE_LIMIT) {
              return current;
            }
            return [...current, { id: readyFile.attachmentId, name: file.name, type: kind }];
          });
        })
        .catch((caught) => {
          setError(caught instanceof Error ? caught.message : "Could not store the file");
        })
        .finally(() => setUploading(false));
    });
  };
  const extraSections = [
    {
      id: "web",
      number: "05",
      title: "Web",
      filled: webLinks.some((row) => row.value.trim()),
      body: <LinkRows rows={webLinks} zone="web" placeholder="Website" onChange={setWebLinks} />,
    },
    {
      id: "social",
      number: "06",
      title: "Social",
      filled: socialLinks.some((row) => row.value.trim()),
      body: (
        <LinkRows rows={socialLinks} zone="social" placeholder="Link — Instagram, LinkedIn, etc." onChange={setSocialLinks} />
      ),
    },
    {
      id: "files",
      number: "07",
      title: "Files",
      filled: contactFiles.length > 0,
      body: (
        <div className="flex min-w-0 flex-col gap-[14px]">
          {contactFiles.map((file) => (
            <div key={file.id} className="flex min-w-0 items-center gap-2">
              <FileText className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
              <span className="min-w-0 flex-1 truncate t-body text-[var(--ink)]">{file.name}</span>
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                className="border-0 bg-transparent p-0 text-[var(--ink)]"
                onClick={() => setContactFiles((current) => current.filter((item) => item.id !== file.id))}
              >
                <X className="size-4" strokeWidth={1.5} aria-hidden />
              </button>
            </div>
          ))}
          {contactFiles.length < CONTACT_FILE_LIMIT ? (
            <button
              type="button"
              className="flex items-center gap-2 border-0 bg-transparent p-0 text-left disabled:text-[var(--grey)]"
              onClick={pickFile}
              disabled={uploading}
            >
              <MarkPlus />
              <span className="t-body text-[var(--placeholder)]">{uploading ? "Uploading" : "Add file"}</span>
            </button>
          ) : null}
        </div>
      ),
    },
  ];
  const filledExtras = extraSections.filter((section) => section.filled);
  const emptyExtras = extraSections.filter((section) => !section.filled);
  const extraSection = (section: (typeof extraSections)[number]) => (
    <section key={section.id} className={sectionClass}>
      <div className="min-w-0">
        <SectionNumber value={section.number} />
        <span className="mt-[6px] block t-label text-[var(--grey)]">{section.title}</span>
      </div>
      {section.body}
    </section>
  );

  const nameHint = name.length === 0;
  const photoName = (
    <div className="pt-[18px] pb-[18px]">
      <div className="flex shrink-0 items-stretch gap-3" style={{ height: 128 }}>
        <PhotoSlotPicker
          photo={photo?.dataUrl ?? keptPhoto}
          onPhotoChange={(dataUrl, file) => {
            setPhoto(dataUrl && file ? { file, dataUrl } : null);
            setKeptPhoto(dataUrl ? keptPhoto : null);
            setPhotoId(null);
            if (editing || !ownerId) return;
            const ticket = ++photoTicket.current;
            if (!dataUrl || !file) {
              setDraftPhoto(null);
              return;
            }
            void prepareCardPhotoForStorage(file)
              .then((stored) => {
                if (photoTicket.current !== ticket || !stored.startsWith("data:image/")) return;
                const record = { ...draftRecordRef.current, photo: stored };
                draftRecordRef.current = record;
                setDraftPhoto(stored);
                if (!persistDraftRef.current) return;
                writeContactDraft(ownerId, record);
              })
              .catch(() => undefined);
          }}
          sizePx={128}
          borderRadiusPx={0}
          photoLook="shadow"
          surfaceClassName="bg-white"
        />
        <div className="relative flex h-full min-w-0 flex-1 flex-col">
          <label
            data-entry-name=""
            className="relative flex h-full min-w-0 max-w-full flex-1 flex-col justify-end overflow-x-hidden"
          >
            <div
              className={
                nameHint ? "relative w-full min-w-0 max-w-full" : "absolute inset-0 min-w-0 overflow-x-hidden"
              }
            >
              {nameHint ? (
                <div aria-hidden className="pointer-events-none t-body text-[var(--placeholder)]">
                  <div className="whitespace-nowrap border-b border-[var(--rule)] pb-[3px]">Name</div>
                </div>
              ) : null}
              <div
                className={
                  nameHint
                    ? "absolute inset-x-0 top-0"
                    : "flex h-full min-h-0 min-w-0 flex-col overflow-x-hidden"
                }
                style={nameHint ? { height: NAME_HINT_LINE_PX } : undefined}
              >
                <HeroName
                  value={name}
                  onChange={(value) => setName(clampNameLines(value))}
                  placeholder="Name"
                  ruled
                  roleBelow={Boolean(headerTitle)}
                />
              </div>
            </div>
          </label>
          {headerTitle ? (
            <p className="m-0 line-clamp-3 min-w-0 shrink-0 overflow-hidden t-label uppercase text-[var(--grey)]">
              {headerTitle}
            </p>
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
      {editing ? (
        <section className={sectionClass}>
          <div className="min-w-0">
            <SectionNumber value="04" />
            <span className="mt-[6px] block t-label text-[var(--grey)]">About</span>
          </div>
          <textarea
            ref={noteRef}
            value={note}
            onChange={(event) => writeNote(event.target.value)}
            rows={1}
            placeholder="Event name, short text"
            aria-label="About"
            className={cn(FIELD, "resize-none whitespace-pre-wrap text-[var(--ink)]")}
          />
        </section>
      ) : (
        <section className={COMPACT}>
          <span className="t-label text-[var(--grey)]">About</span>
          <textarea
            ref={noteRef}
            value={note}
            onChange={(event) => writeNote(event.target.value)}
            rows={1}
            placeholder="Event name, short text"
            aria-label="About"
            className={cn(FIELD, "resize-none text-[var(--ink)]")}
          />
        </section>
      )}
      {editing ? (
        <>
          {filledExtras.map(extraSection)}
          {emptyExtras.length > 0 ? (
            <MoreRow
              open={moreOpen}
              hint={emptyExtras.map((section) => section.title).join(", ")}
              onToggle={() => setMoreOpen((current) => !current)}
            />
          ) : null}
          {moreOpen ? emptyExtras.map(extraSection) : null}
        </>
      ) : null}
      <div className="mt-[18px] flex gap-3">
        <button type="button" className={GHOST_CREATE} onClick={() => setScanning(true)}>
          <Scan className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
          Scan
        </button>
        {editing ? null : (
          <button
            type="button"
            className={cn(GHOST_CREATE, voicePhase === "recording" && "bg-sky")}
            aria-pressed={voicePhase === "recording"}
            onPointerDown={beginVoice}
            onClick={() => {
              if (!canRead) lastLine.current?.focus();
            }}
            onContextMenu={(event) => event.preventDefault()}
          >
            {voicePhase === "recording" ? (
              <VoiceWave />
            ) : voicePhase === "processing" ? (
              <VoiceSpin />
            ) : (
              <>
                <Mic className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
                Voice
              </>
            )}
          </button>
        )}
      </div>
      {error ? (
        <p className={cn("mt-3 text-[#E23B2F]", error === "Try again" ? "t-caps" : "t-meta")}>{error}</p>
      ) : null}
    </>
  );

  if (editing) {
    return (
      <main className="compass-main flex h-dvh flex-col overflow-hidden bg-white text-[var(--ink)]">
        <form
          onSubmit={(event) => void save(event)}
          className="card-scroll-spring flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div
            ref={scrollRef}
            className="compass-card-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-[var(--gutter)]"
          >
            <div className="pb-[max(24px,env(safe-area-inset-bottom))]">
              <ScreenHeader title="Edit" fallbackHref={`/network/x/${initial!.id}`} />
              {fields}
            </div>
          </div>
          <TabBand
            label="Edit"
            left={
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (!armedDelete) {
                    setArmedDelete(true);
                    return;
                  }
                  void removeContact();
                }}
                className={SAVE_BAND}
              >
                {armedDelete ? "Delete?" : "Delete"}
              </button>
            }
            right={
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
            onCapture={
              canRead
                ? (blob) => {
                    setScanning(false);
                    void readFile("image", blob, "scan.jpg");
                  }
                : undefined
            }
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
          label="New contact"
          left={
            <button type="button" disabled={!formDirty} onClick={resetForm} className={SAVE_BAND}>
              Reset
            </button>
          }
          right={
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
          onCapture={
            canRead
              ? (blob) => {
                  setScanning(false);
                  void readFile("image", blob, "scan.jpg");
                }
              : undefined
          }
        />
      ) : null}
    </main>
  );
}

function VoiceWave() {
  const bars = [
    { x: 1.6, h: 4 },
    { x: 5.2, h: 8 },
    { x: 8.8, h: 13 },
    { x: 12.4, h: 8 },
    { x: 16, h: 4 },
  ];
  return (
    <svg width="18" height="16" viewBox="0 0 18 16" aria-hidden className="shrink-0 text-[var(--ink)]">
      {bars.map((bar, index) => (
        <line
          key={bar.x}
          x1={bar.x}
          x2={bar.x}
          y1={8 - bar.h / 2}
          y2={8 + bar.h / 2}
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          className="motion-reduce:[animation:none]"
          style={{
            transformBox: "fill-box",
            transformOrigin: "center",
            animation: "voice-wave 0.9s ease-in-out infinite",
            animationDelay: `${index * 0.12}s`,
          }}
        />
      ))}
    </svg>
  );
}

function VoiceSpin() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden
      className="shrink-0 animate-spin text-[var(--ink)] motion-reduce:animate-none"
    >
      <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.18" />
      <path
        d="M8 1.8a6.2 6.2 0 0 1 6.2 6.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
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
