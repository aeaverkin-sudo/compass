"use client";

import { useRef, useState } from "react";
import { nanoid } from "nanoid";
import { FileText, Mic, Camera, Plus, Trash2, RotateCcw } from "lucide-react";
import type { NextScanAddon } from "@/shared/types";
import { MAX_NEXT_SCAN_NOTES } from "@/shared/types";
import { fileToDataUrl } from "@/shared/lib/utils";
import { MOCK_VOICE_TRANSCRIPTION } from "@/shared/constants/mock-data";

interface NextScanMenuProps {
  addons: NextScanAddon[];
  onSetAddons: (addons: NextScanAddon[]) => void;
  compact?: boolean;
}

export function NextScanAddonIcon({ type }: { type: NextScanAddon["type"] }) {
  if (type === "text") return <FileText size={14} strokeWidth={1.5} />;
  if (type === "voice") return <Mic size={14} strokeWidth={1.5} />;
  return <Camera size={14} strokeWidth={1.5} />;
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
  const selfieRef = useRef<HTMLInputElement>(null);

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
    const without = redoId ? addons.filter((a) => a.id !== redoId) : addons;
    onSetAddons([...without, next]);
    closeMenu();
  };

  const removeAddon = (id: string) => {
    onSetAddons(addons.filter((a) => a.id !== id));
  };

  const startRedo = (addon: NextScanAddon) => {
    removeAddon(addon.id);
    setRedoId(addon.id);
    if (addon.type === "text") {
      setText(addon.content);
      setTextMode(true);
    } else if (addon.type === "selfie") {
      selfieRef.current?.click();
    } else {
      setRecording(true);
      setTimeout(() => {
        setRecording(false);
        addAddon("voice", MOCK_VOICE_TRANSCRIPTION);
      }, 1200);
    }
  };

  const handleVoice = () => {
    setRecording(true);
    setTimeout(() => {
      setRecording(false);
      addAddon("voice", MOCK_VOICE_TRANSCRIPTION);
    }, 1200);
  };

  return (
    <div className={compact ? "relative shrink-0" : "absolute right-3 top-3"}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="relative flex h-8 w-8 items-center justify-center rounded-full bg-[#f0f0f0] text-[#666]"
        aria-label="Next scan notes"
      >
        <Plus size={16} strokeWidth={1.5} />
        {addons.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#E85D04] px-1 text-[10px] font-semibold leading-none text-white">
            {addons.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <button type="button" className="fixed inset-0 z-40" onClick={closeMenu} />
          <div
            className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl bg-white p-2"
            style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.12)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {addons.length > 0 && !textMode && (
              <ul className="mb-1 border-b border-[#f0f0f0] pb-1">
                {addons.map((addon, index) => (
                  <li
                    key={addon.id}
                    className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-[#fafafa]"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E85D04] text-[10px] font-semibold text-white">
                      {index + 1}
                    </span>
                    <NextScanAddonIcon type={addon.type} />
                    <span className="min-w-0 flex-1 truncate text-[12px] text-[#444]">
                      {addonPreview(addon)}
                    </span>
                    <button
                      type="button"
                      onClick={() => startRedo(addon)}
                      className="shrink-0 p-1 text-[#888] hover:text-[#1a1a1a]"
                      aria-label="Redo note"
                    >
                      <RotateCcw size={14} strokeWidth={1.5} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeAddon(addon.id)}
                      className="shrink-0 p-1 text-[#888] hover:text-[#c00]"
                      aria-label="Delete note"
                    >
                      <Trash2 size={14} strokeWidth={1.5} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {textMode ? (
              <div className="p-2">
                <textarea
                  autoFocus
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Short note…"
                  rows={3}
                  className="mb-2 w-full resize-none border-b border-[#eee] bg-transparent text-[13px] outline-none"
                />
                <button
                  type="button"
                  disabled={!text.trim()}
                  onClick={() => addAddon("text", text.trim())}
                  className="text-[13px] font-medium text-[#1a1a1a] disabled:opacity-40"
                >
                  {redoId ? "Save" : "Add"}
                </button>
              </div>
            ) : (
              !atMax && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setRedoId(null);
                      setTextMode(true);
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] hover:bg-[#f7f7f7]"
                  >
                    <FileText size={16} strokeWidth={1.5} />
                    Add a short text
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRedoId(null);
                      selfieRef.current?.click();
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] hover:bg-[#f7f7f7]"
                  >
                    <Camera size={16} strokeWidth={1.5} />
                    Add a selfie
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRedoId(null);
                      handleVoice();
                    }}
                    disabled={recording}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] hover:bg-[#f7f7f7] disabled:opacity-50"
                  >
                    <Mic size={16} strokeWidth={1.5} />
                    {recording ? "Recording…" : "Add a voice note"}
                  </button>
                  {addons.length === 0 && (
                    <p className="px-3 py-2 text-[10px] text-[#aaa]">For the next scan only.</p>
                  )}
                </>
              )
            )}

            {atMax && !textMode && (
              <p className="px-3 py-2 text-[10px] text-[#aaa]">
                Maximum {MAX_NEXT_SCAN_NOTES} notes for next scan.
              </p>
            )}
          </div>
        </>
      )}

      <input
        ref={selfieRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          addAddon("selfie", await fileToDataUrl(file));
          e.target.value = "";
        }}
      />
    </div>
  );
}
