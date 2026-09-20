"use client";

import { Camera, FileText, Mic, Plus, RotateCcw, Trash2 } from "lucide-react";
import { nanoid } from "nanoid";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { QR_COLOR } from "../layout";
import { MAX_NEXT_SCAN_NOTES, type NextScanAddon } from "@/shared/types";
import { openSelfiePicker } from "@landing/components/photo-input-utils";

const MOCK_VOICE_TRANSCRIPTION =
  "Great meeting you — let's follow up about the project next week.";

type NextScanMenuProps = {
  addons: NextScanAddon[];
  onSetAddons: (addons: NextScanAddon[]) => void;
  compact?: boolean;
};

function NextScanAddonIcon({ type }: { type: NextScanAddon["type"] }) {
  if (type === "text") return <FileText className="size-3.5" strokeWidth={1.25} aria-hidden />;
  if (type === "voice") return <Mic className="size-3.5" strokeWidth={1.25} aria-hidden />;
  return <Camera className="size-3.5" strokeWidth={1.25} aria-hidden />;
}

function addonPreview(addon: NextScanAddon): string {
  if (addon.type === "selfie") return "Selfie";
  return addon.content.slice(0, 48) + (addon.content.length > 48 ? "…" : "");
}

export function NextScanMenu({ addons, onSetAddons, compact }: NextScanMenuProps) {
  const [open, setOpen] = useState(false);
  const [textMode, setTextMode] = useState(false);
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [redoId, setRedoId] = useState<string | null>(null);
  const [pickingSelfie, setPickingSelfie] = useState(false);

  const atMax = addons.length >= MAX_NEXT_SCAN_NOTES;

  const closeMenu = () => {
    setOpen(false);
    setTextMode(false);
    setText("");
    setRedoId(null);
  };

  const addAddon = (type: NextScanAddon["type"], content: string) => {
    const next: NextScanAddon = {
      id: redoId ?? nanoid(),
      type,
      content,
      createdAt: new Date().toISOString(),
    };
    const without = redoId ? addons.filter((addon) => addon.id !== redoId) : addons;
    onSetAddons([...without, next]);
    closeMenu();
  };

  const removeAddon = (id: string) => {
    onSetAddons(addons.filter((addon) => addon.id !== id));
  };

  const startRedo = (addon: NextScanAddon) => {
    removeAddon(addon.id);
    setRedoId(addon.id);
    if (addon.type === "text") {
      setText(addon.content);
      setTextMode(true);
      return;
    }
    if (addon.type === "selfie") {
      void pickSelfie();
      return;
    }
    setRecording(true);
    window.setTimeout(() => {
      setRecording(false);
      addAddon("voice", MOCK_VOICE_TRANSCRIPTION);
    }, 1200);
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

  const handleVoice = () => {
    setRecording(true);
    window.setTimeout(() => {
      setRecording(false);
      addAddon("voice", MOCK_VOICE_TRANSCRIPTION);
    }, 1200);
  };

  return (
    <div className={cn("relative shrink-0", compact ? "" : "absolute right-3 top-3 z-10")}>
      <button
        type="button"
        data-card-content
        aria-label="Next scan notes"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className="relative flex size-8 items-center justify-center rounded-full bg-[oklch(96%_0.006_70)] text-hint transition-opacity active:opacity-60"
      >
        <Plus className="size-4" strokeWidth={1.25} aria-hidden />
        {addons.length > 0 ? (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none text-white"
            style={{ backgroundColor: QR_COLOR }}
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
            onClick={closeMenu}
          />
          <div
            className="absolute right-0 top-full z-50 mt-2 w-64 rounded-[14px] border border-hairline/30 bg-sheet p-2 shadow-[0_4px_24px_oklch(0%_0_0/0.12)]"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            role="dialog"
            aria-label="Next scan"
          >
            {addons.length > 0 && !textMode ? (
              <ul className="mb-1 divide-y divide-hairline/25 border-b border-hairline/25 pb-1">
                {addons.map((addon, index) => (
                  <li
                    key={addon.id}
                    className="flex items-center gap-2 rounded-lg px-2 py-2"
                  >
                    <span
                      className="flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                      style={{ backgroundColor: QR_COLOR }}
                    >
                      {index + 1}
                    </span>
                    <NextScanAddonIcon type={addon.type} />
                    <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">
                      {addonPreview(addon)}
                    </span>
                    <button
                      type="button"
                      onClick={() => startRedo(addon)}
                      className="shrink-0 p-1 text-hint transition-opacity active:opacity-60"
                      aria-label="Redo note"
                    >
                      <RotateCcw className="size-3.5" strokeWidth={1.25} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeAddon(addon.id)}
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
                  autoFocus
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder="Short note…"
                  rows={3}
                  className="compass-input mb-2 w-full resize-none border-b border-hairline/30 bg-transparent text-[13px] outline-none placeholder:text-hint"
                />
                <button
                  type="button"
                  disabled={!text.trim()}
                  onClick={() => addAddon("text", text.trim())}
                  className="text-[13px] font-medium text-foreground disabled:opacity-40"
                >
                  {redoId ? "Save" : "Add"}
                </button>
              </div>
            ) : !atMax ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setRedoId(null);
                    setTextMode(true);
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] text-foreground transition-opacity active:opacity-60"
                >
                  <FileText className="size-4" strokeWidth={1.25} aria-hidden />
                  Add a short text
                </button>
                <button
                  type="button"
                  disabled={pickingSelfie}
                  onClick={() => {
                    setRedoId(null);
                    pickSelfie();
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] text-foreground transition-opacity active:opacity-60 disabled:opacity-50"
                >
                  <Camera className="size-4" strokeWidth={1.25} aria-hidden />
                  {pickingSelfie ? "Opening camera…" : "Add a selfie"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRedoId(null);
                    handleVoice();
                  }}
                  disabled={recording}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] text-foreground transition-opacity active:opacity-60 disabled:opacity-50"
                >
                  <Mic className="size-4" strokeWidth={1.25} aria-hidden />
                  {recording ? "Recording…" : "Add a voice note"}
                </button>
                {addons.length === 0 ? (
                  <p className="px-3 py-2 text-[10px] text-hint">For the next scan only.</p>
                ) : null}
              </>
            ) : null}

            {atMax && !textMode ? (
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
