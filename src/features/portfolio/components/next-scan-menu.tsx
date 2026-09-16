"use client";

import { useRef, useState } from "react";
import { nanoid } from "nanoid";
import { FileText, Mic, Camera, Plus, ChevronLeft } from "lucide-react";
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

const ADD_ROWS: { type: NextScanAddon["type"]; label: string }[] = [
  { type: "text", label: "Add a short text" },
  { type: "selfie", label: "Add a selfie" },
  { type: "voice", label: "Add a voice note" },
];

export function NextScanAddonIcon({ type }: { type: NextScanAddon["type"] }) {
  if (type === "text") return <FileText size={16} strokeWidth={1.5} />;
  if (type === "voice") return <Mic size={16} strokeWidth={1.5} />;
  return <Camera size={16} strokeWidth={1.5} />;
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

  const addonForType = (type: NextScanAddon["type"]) =>
    addons.find((a) => a.type === type);

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
    if (addonForType("voice") || atMax) return;
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
    if (addonForType("selfie") || atMax) return;
    closeMenu();
    setTimeout(() => selfieRef.current?.click(), 50);
  };

  const handleAddRow = (type: NextScanAddon["type"]) => {
    if (addonForType(type)) return;
    if (atMax) return;
    if (type === "text") setTextMode(true);
    else if (type === "selfie") openSelfiePicker();
    else if (type === "voice") handleVoice();
  };

  return (
    <div
      data-no-toggle
      className={compact ? "relative shrink-0" : "absolute right-3 top-3 z-10"}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="relative flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-muted)]"
        style={{ background: "var(--chip)" }}
        aria-label={count > 0 ? `${count} next scan notes` : "Add next scan note"}
      >
        <Plus size={16} strokeWidth={1.5} />
        {count > 0 && (
          <span
            className="pointer-events-none absolute -right-1 -top-1 z-10 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-bold leading-none text-white"
            style={{ background: "var(--accent)", boxShadow: "0 0 0 2px var(--sheet)" }}
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
                  Delete
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
            ) : (
              <>
                {ADD_ROWS.map(({ type, label }) => {
                  const addon = addonForType(type);
                  const canAdd = !addon && !atMax;

                  return (
                    <div
                      key={type}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${
                        canAdd ? "cursor-pointer hover:bg-[#f7f7f7]" : ""
                      }`}
                      role={canAdd ? "button" : undefined}
                      tabIndex={canAdd ? 0 : undefined}
                      onClick={canAdd ? () => handleAddRow(type) : undefined}
                      onKeyDown={
                        canAdd
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") handleAddRow(type);
                            }
                          : undefined
                      }
                    >
                      <NextScanAddonIcon type={type} />
                      <span
                        className={`min-w-0 flex-1 text-[13px] ${
                          addon ? "text-[#1a1a1a]" : "text-[#1a1a1a]"
                        }`}
                      >
                        {label}
                      </span>
                      {addon && (
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setViewingId(addon.id);
                            }}
                            className="text-[12px] text-[#666] hover:text-[#1a1a1a]"
                          >
                            Open
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeAddon(addon.id);
                            }}
                            className="text-[12px] text-[#888] hover:text-[#c00]"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
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
