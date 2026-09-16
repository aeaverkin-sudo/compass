"use client";

import { useRef, useState } from "react";
import { nanoid } from "nanoid";
import { FileText, Mic, Camera, Plus, Trash2, Search, ChevronLeft } from "lucide-react";
import type { NextScanAddon } from "@/shared/types";
import { MAX_NEXT_SCAN_NOTES } from "@/shared/types";
import { fileToDataUrl } from "@/shared/lib/utils";
import { MOCK_VOICE_TRANSCRIPTION } from "@/shared/constants/mock-data";

interface NextScanMenuProps {
  addons: NextScanAddon[];
  onSetAddons: (addons: NextScanAddon[]) => void;
  compact?: boolean;
}

const TYPE_LABELS: Record<NextScanAddon["type"], string> = {
  text: "Short text",
  selfie: "Selfie",
  voice: "Voice note",
};

export function NextScanAddonIcon({ type }: { type: NextScanAddon["type"] }) {
  if (type === "text") return <FileText size={16} strokeWidth={1.5} />;
  if (type === "voice") return <Mic size={16} strokeWidth={1.5} />;
  return <Camera size={16} strokeWidth={1.5} />;
}

function addonPreview(addon: NextScanAddon): string {
  if (addon.type === "selfie") return "Selfie";
  return addon.content.slice(0, 40) + (addon.content.length > 40 ? "…" : "");
}

export function NextScanMenu({ addons, onSetAddons, compact }: NextScanMenuProps) {
  const [open, setOpen] = useState(false);
  const [textMode, setTextMode] = useState(false);
  const [text, setText] = useState("");
  const [viewingId, setViewingId] = useState<string | null>(null);
  const selfieRef = useRef<HTMLInputElement>(null);
  const addonsRef = useRef(addons);
  addonsRef.current = addons;

  const atMax = addons.length >= MAX_NEXT_SCAN_NOTES;
  const viewing = addons.find((a) => a.id === viewingId) ?? null;
  const count = addons.length;

  const closeMenu = () => {
    setOpen(false);
    setTextMode(false);
    setText("");
    setViewingId(null);
  };

  const confirmAddon = (type: NextScanAddon["type"], content: string) => {
    const next: NextScanAddon = {
      id: nanoid(),
      type,
      content,
      createdAt: new Date().toISOString(),
    };
    closeMenu();
    onSetAddons([...addons, next]);
  };

  const removeAddon = (id: string) => {
    onSetAddons(addons.filter((a) => a.id !== id));
    if (viewingId === id) setViewingId(null);
  };

  const handleVoice = () => {
    const snapshot = [...addons];
    closeMenu();
    setTimeout(() => {
      onSetAddons([
        ...snapshot,
        {
          id: nanoid(),
          type: "voice",
          content: MOCK_VOICE_TRANSCRIPTION,
          createdAt: new Date().toISOString(),
        },
      ]);
    }, 800);
  };

  const openSelfiePicker = () => {
    closeMenu();
    setTimeout(() => selfieRef.current?.click(), 50);
  };

  return (
    <div className={compact ? "relative shrink-0" : "absolute right-3 top-3 z-10"}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="relative flex h-8 w-8 items-center justify-center rounded-full bg-[#f0f0f0] text-[#666]"
        aria-label={count > 0 ? `${count} next scan notes` : "Add next scan note"}
      >
        <Plus size={16} strokeWidth={1.5} />
        {count > 0 && (
          <span
            className="pointer-events-none absolute -right-1 -top-1 z-10 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#E85D04] px-1 text-[11px] font-bold leading-none text-white"
            style={{ boxShadow: "0 0 0 2px #fff" }}
          >
            {count}
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
            {viewing ? (
              <div className="p-2">
                <button
                  type="button"
                  onClick={() => setViewingId(null)}
                  className="mb-3 flex items-center gap-1 text-[12px] text-[#888]"
                >
                  <ChevronLeft size={14} />
                  Back
                </button>
                <p className="mb-2 text-[11px] font-medium text-[#E85D04]">
                  {TYPE_LABELS[viewing.type]}
                </p>
                {viewing.type === "text" && (
                  <p className="text-[13px] leading-relaxed text-[#1a1a1a]">{viewing.content}</p>
                )}
                {viewing.type === "voice" && (
                  <p className="text-[13px] italic leading-relaxed text-[#666]">{viewing.content}</p>
                )}
                {viewing.type === "selfie" && (
                  <img src={viewing.content} alt="" className="w-full rounded-lg object-cover" />
                )}
                <button
                  type="button"
                  onClick={() => {
                    removeAddon(viewing.id);
                    setViewingId(null);
                  }}
                  className="mt-4 w-full border-t border-[#eee] pt-3 text-[12px] text-[#888]"
                >
                  Remove
                </button>
              </div>
            ) : textMode ? (
              <div className="p-2">
                <textarea
                  autoFocus
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Short note…"
                  rows={3}
                  className="mb-2 w-full resize-none border-b border-[#eee] bg-transparent text-[13px] outline-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && text.trim()) {
                      e.preventDefault();
                      confirmAddon("text", text.trim());
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={!text.trim()}
                  onClick={(e) => {
                    e.stopPropagation();
                    confirmAddon("text", text.trim());
                  }}
                  className="text-[13px] font-medium text-[#1a1a1a] disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            ) : atMax ? (
              <>
                {addons.map((addon, index) => (
                  <div
                    key={addon.id}
                    className="flex items-center gap-2 rounded-lg px-3 py-2.5 hover:bg-[#f7f7f7]"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E85D04] text-[10px] font-semibold text-white">
                      {index + 1}
                    </span>
                    <NextScanAddonIcon type={addon.type} />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-[#1a1a1a]">
                      {TYPE_LABELS[addon.type]}
                    </span>
                    <button
                      type="button"
                      onClick={() => setViewingId(addon.id)}
                      className="shrink-0 p-1.5 text-[#888] hover:text-[#1a1a1a]"
                      aria-label="View note"
                    >
                      <Search size={15} strokeWidth={1.5} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeAddon(addon.id)}
                      className="shrink-0 p-1.5 text-[#888] hover:text-[#c00]"
                      aria-label="Delete note"
                    >
                      <Trash2 size={15} strokeWidth={1.5} />
                    </button>
                  </div>
                ))}
              </>
            ) : (
              <>
                {addons.map((addon, index) => (
                  <div
                    key={addon.id}
                    className="flex items-center gap-2 rounded-lg px-3 py-1.5 hover:bg-[#fafafa]"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E85D04] text-[10px] font-semibold text-white">
                      {index + 1}
                    </span>
                    <NextScanAddonIcon type={addon.type} />
                    <span className="min-w-0 flex-1 truncate text-[12px] text-[#666]">
                      {addonPreview(addon)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setViewingId(addon.id)}
                      className="shrink-0 p-1 text-[#888] hover:text-[#1a1a1a]"
                      aria-label="View note"
                    >
                      <Search size={14} strokeWidth={1.5} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeAddon(addon.id)}
                      className="shrink-0 p-1 text-[#888] hover:text-[#c00]"
                      aria-label="Delete note"
                    >
                      <Trash2 size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                ))}

                {addons.length > 0 && <div className="my-1 border-t border-[#f0f0f0]" />}

                <button
                  type="button"
                  onClick={() => setTextMode(true)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] hover:bg-[#f7f7f7]"
                >
                  <FileText size={16} strokeWidth={1.5} />
                  Add a short text
                </button>
                <button
                  type="button"
                  onClick={openSelfiePicker}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] hover:bg-[#f7f7f7]"
                >
                  <Camera size={16} strokeWidth={1.5} />
                  Add a selfie
                </button>
                <button
                  type="button"
                  onClick={handleVoice}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] hover:bg-[#f7f7f7]"
                >
                  <Mic size={16} strokeWidth={1.5} />
                  Add a voice note
                </button>
                {addons.length === 0 && (
                  <p className="px-3 py-2 text-[10px] text-[#aaa]">For the next scan only.</p>
                )}
              </>
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
          const dataUrl = await fileToDataUrl(file);
          e.target.value = "";
          onSetAddons([
            ...addonsRef.current,
            {
              id: nanoid(),
              type: "selfie",
              content: dataUrl,
              createdAt: new Date().toISOString(),
            },
          ]);
        }}
      />
    </div>
  );
}
