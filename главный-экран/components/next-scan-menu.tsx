"use client";

import { Camera, FileText, Mic, Plus, Trash2 } from "lucide-react";
import { nanoid } from "nanoid";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/lib/utils";
import { MAX_NEXT_SCAN_NOTES, type NextScanAddon } from "@/shared/types";
import { openSelfiePicker } from "@landing/components/photo-input-utils";

const MAX_VOICE_MS = 10_000;
const MIN_VOICE_MS = 1_000;

function voiceMime() {
  if (typeof MediaRecorder === "undefined") return "";
  const types = ["audio/mp4", "audio/aac", "audio/webm;codecs=opus", "audio/webm"];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

type NextScanMenuProps = {
  addons: NextScanAddon[];
  onSetAddons: (addons: NextScanAddon[]) => void;
  compact?: boolean;
  bare?: boolean;
};

function NextScanAddonIcon({ type }: { type: NextScanAddon["type"] }) {
  if (type === "text") return <FileText className="size-3.5" strokeWidth={1.25} aria-hidden />;
  if (type === "voice") return <Mic className="size-3.5" strokeWidth={1.25} aria-hidden />;
  return <Camera className="size-3.5" strokeWidth={1.25} aria-hidden />;
}

function addonPreview(addon: NextScanAddon): string {
  if (addon.type === "selfie") return "Selfie";
  if (addon.type === "voice") return "Voice note";
  return addon.content.slice(0, 48) + (addon.content.length > 48 ? "…" : "");
}

export function NextScanMenu({ addons, onSetAddons, compact, bare }: NextScanMenuProps) {
  const [open, setOpen] = useState(false);
  const [textMode, setTextMode] = useState(false);
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordMs, setRecordMs] = useState(0);
  const [voiceHint, setVoiceHint] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [pickingSelfie, setPickingSelfie] = useState(false);
  const [viewing, setViewing] = useState<NextScanAddon | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const stopWantedRef = useRef(false);
  const tickRef = useRef<number | null>(null);
  const limitRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const atMax = addons.length >= MAX_NEXT_SCAN_NOTES;
  const hasType = (type: NextScanAddon["type"]) => addons.some((addon) => addon.type === type);

  const closeMenu = () => {
    textRef.current?.blur();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    setOpen(false);
    setTextMode(false);
    setText("");
    setViewing(null);
    setVoiceHint("");
    setPlayingId(null);
    audioRef.current?.pause();
    window.speechSynthesis?.cancel();
  };

  const clearVoiceTimers = () => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    if (limitRef.current) window.clearTimeout(limitRef.current);
    tickRef.current = null;
    limitRef.current = null;
  };

  const releaseMic = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    return () => {
      clearVoiceTimers();
      releaseMic();
      audioRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) return;
      closeMenu();
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  useEffect(() => {
    if (!textMode) return;
    textRef.current?.focus({ preventScroll: true });
  }, [textMode]);

  const addAddon = (type: NextScanAddon["type"], content: string) => {
    if (addons.length >= MAX_NEXT_SCAN_NOTES || addons.some((addon) => addon.type === type)) return;
    const next: NextScanAddon = {
      id: nanoid(),
      type,
      content,
      createdAt: new Date().toISOString(),
    };
    onSetAddons([...addons, next]);
    closeMenu();
  };

  const removeAddon = (id: string) => {
    onSetAddons(addons.filter((addon) => addon.id !== id));
  };

  const openAddon = (addon: NextScanAddon) => {
    if (addon.type === "voice") return;
    setTextMode(false);
    setViewing(addon);
  };

  const stopPlayback = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    window.speechSynthesis?.cancel();
    setPlayingId(null);
  };

  const holdPlay = (addon: NextScanAddon, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    stopPlayback();
    setPlayingId(addon.id);
    if (addon.content.startsWith("data:") || addon.content.startsWith("blob:")) {
      const audio = new Audio(addon.content);
      audioRef.current = audio;
      void audio.play().catch(() => {
        setPlayingId(null);
        setVoiceHint("Couldn't play this note");
      });
      return;
    }
    window.speechSynthesis?.speak(new SpeechSynthesisUtterance(addon.content));
  };

  const finishVoice = (blob: Blob, elapsed: number) => {
    clearVoiceTimers();
    releaseMic();
    recorderRef.current = null;
    setRecording(false);
    setRecordMs(0);
    if (elapsed < MIN_VOICE_MS || blob.size === 0) {
      setVoiceHint("Hold to record");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") addAddon("voice", reader.result);
    };
    reader.readAsDataURL(blob);
  };

  const stopVoice = () => {
    stopWantedRef.current = true;
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    if (recorder.state === "recording") recorder.stop();
  };

  const beginVoice = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (atMax || recording || hasType("voice")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    stopWantedRef.current = false;
    setVoiceHint("");
    startedAtRef.current = Date.now();

    void navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        if (stopWantedRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          if (Date.now() - startedAtRef.current < MIN_VOICE_MS) setVoiceHint("Hold to record");
          return;
        }
        streamRef.current = stream;
        const mime = voiceMime();
        const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        chunksRef.current = [];
        recorder.ondataavailable = (chunk) => {
          if (chunk.data.size > 0) chunksRef.current.push(chunk.data);
        };
        recorder.onstop = () => {
          const elapsed = Date.now() - startedAtRef.current;
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mime || "audio/mp4" });
          chunksRef.current = [];
          finishVoice(blob, elapsed);
        };
        recorderRef.current = recorder;
        recorder.start();
        setRecording(true);
        setRecordMs(0);
        tickRef.current = window.setInterval(() => {
          setRecordMs(Date.now() - startedAtRef.current);
        }, 100);
        limitRef.current = window.setTimeout(() => {
          if (recorder.state === "recording") recorder.stop();
        }, MAX_VOICE_MS);
      })
      .catch(() => {
        setRecording(false);
        setVoiceHint("Microphone isn't available");
      });
  };

  const pickSelfie = () => {
    if (pickingSelfie) return;
    setPickingSelfie(true);

    openSelfiePicker(
      (dataUrl) => {
        setPickingSelfie(false);
        addAddon("selfie", dataUrl);
      },
      () => setPickingSelfie(false),
    );
  };

  const secondsLeft = Math.max(0, Math.ceil((MAX_VOICE_MS - recordMs) / 1000));

  return (
    <div ref={rootRef} className={cn("relative shrink-0", bare ? "z-10" : compact ? "" : "absolute right-3 top-3 z-10")}>
      <button
        type="button"
        data-card-content
        data-no-swipe
        aria-label="Next scan notes"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        onPointerDown={(event) => event.stopPropagation()}
        className={cn(
          "relative transition-opacity active:opacity-60",
          bare ? "flex size-6 items-center justify-center" : "compass-icon-circle size-8",
          open && "z-[60]",
        )}
      >
        <Plus className={cn(bare ? "size-5 text-[#111]" : "size-4 text-label")} strokeWidth={1} aria-hidden />
        {addons.length > 0 ? (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-medium leading-none text-white"
          >
            {addons.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40"
            aria-label="Close menu"
            onClick={(event) => {
              event.stopPropagation();
              closeMenu();
            }}
            onPointerDown={(event) => event.stopPropagation()}
          />
          <div
            className="compass-block compass-sky absolute right-0 top-full z-50 mt-2 w-64 rounded-[22px] p-2"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            role="dialog"
            aria-label="Next scan"
          >
            {viewing ? (
              <div className="p-2">
                {viewing.type === "selfie" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={viewing.content} alt="" className="mb-2 w-full object-cover" />
                ) : (
                  <p className="mb-2 text-[13px] leading-[1.35] text-foreground">{viewing.content}</p>
                )}
                <button
                  type="button"
                  onClick={() => {
                    window.speechSynthesis?.cancel();
                    setViewing(null);
                  }}
                  className="text-[13px] font-medium text-foreground"
                >
                  Back
                </button>
              </div>
            ) : null}

            {addons.length > 0 && !textMode && !viewing ? (
              <ul className="mb-1 divide-y divide-hairline/25 border-b border-hairline/25 pb-1">
                {addons.map((addon, index) => (
                  <li key={addon.id} className="flex items-center gap-2 rounded-lg px-2 py-2">
                    <button
                      type="button"
                      onClick={addon.type === "voice" ? undefined : () => openAddon(addon)}
                      onPointerDown={addon.type === "voice" ? (event) => holdPlay(addon, event) : undefined}
                      onPointerUp={addon.type === "voice" ? stopPlayback : undefined}
                      onPointerCancel={addon.type === "voice" ? stopPlayback : undefined}
                      onContextMenu={addon.type === "voice" ? (event) => event.preventDefault() : undefined}
                      className={cn(
                        "flex min-w-0 flex-1 items-center gap-2 text-left",
                        addon.type === "voice" && "touch-none select-none",
                      )}
                    >
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[10px] font-medium text-white">
                        {index + 1}
                      </span>
                      <span className={cn(playingId === addon.id && "animate-pulse text-[#E8640C]")}>
                        <NextScanAddonIcon type={addon.type} />
                      </span>
                      <span className="min-w-0 flex-1 truncate whitespace-nowrap text-[12px] text-foreground">
                        {addonPreview(addon)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeAddon(addon.id);
                      }}
                      className="shrink-0 p-1 text-hint transition-opacity active:opacity-60"
                      aria-label="Delete note"
                    >
                      <Trash2 className="size-3.5" strokeWidth={1.25} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {textMode ? (
              <div className="p-2">
                <textarea
                  ref={textRef}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder="Short note…"
                  rows={3}
                  className="compass-input mb-2 w-full resize-none border-b border-hairline/30 bg-transparent text-[16px] leading-[1.35] outline-none placeholder:text-hint"
                />
                <button
                  type="button"
                  disabled={!text.trim()}
                  onClick={() => addAddon("text", text.trim())}
                  className="text-[13px] font-medium text-foreground disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            ) : !atMax && !viewing ? (
              <>
                {!hasType("text") ? (
                <button
                  type="button"
                  onClick={() => setTextMode(true)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] text-foreground transition-opacity active:opacity-60"
                >
                  <FileText className="size-4" strokeWidth={1.25} aria-hidden />
                  Add a short text
                </button>
                ) : null}
                {!hasType("selfie") ? (
                <button
                  type="button"
                  disabled={pickingSelfie}
                  onClick={() => pickSelfie()}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] text-foreground transition-opacity active:opacity-60 disabled:opacity-50"
                >
                  <Camera className="size-4" strokeWidth={1.25} aria-hidden />
                  {pickingSelfie ? "Opening camera…" : "Add a selfie"}
                </button>
                ) : null}
                {!hasType("voice") ? (
                <button
                  type="button"
                  onPointerDown={beginVoice}
                  onPointerUp={(event) => {
                    event.stopPropagation();
                    stopVoice();
                  }}
                  onPointerCancel={stopVoice}
                  onContextMenu={(event) => event.preventDefault()}
                  className="flex w-full touch-none items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] text-foreground select-none"
                >
                  <Mic className={cn("size-4", recording && "animate-pulse text-[#E8640C]")} strokeWidth={1.25} aria-hidden />
                  {recording ? `Recording · ${secondsLeft}s` : "Add a voice note"}
                </button>
                ) : null}
                {voiceHint ? <p className="px-3 pb-1 text-[10px] text-hint">{voiceHint}</p> : null}
                <p className="px-3 py-2 text-[10px] text-[#111]">* For the next scan only.</p>
              </>
            ) : null}

            {atMax && !textMode && !viewing ? (
              <p className="px-3 py-2 text-[10px] text-hint">
                Maximum {MAX_NEXT_SCAN_NOTES} notes for next scan.
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
