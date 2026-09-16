"use client";

import { useRef, useState } from "react";
import { FileText, Mic, Camera, Plus } from "lucide-react";
import type { NextScanAddon } from "@/shared/types";
import { fileToDataUrl } from "@/shared/lib/utils";
import { MOCK_VOICE_TRANSCRIPTION } from "@/shared/constants/mock-data";

interface NextScanMenuProps {
  addon?: NextScanAddon | null;
  onSetAddon: (addon: NextScanAddon | null) => void;
  compact?: boolean;
}

export function NextScanAddonIcon({ type }: { type: NextScanAddon["type"] }) {
  if (type === "text") return <FileText size={14} strokeWidth={1.5} />;
  if (type === "voice") return <Mic size={14} strokeWidth={1.5} />;
  return <Camera size={14} strokeWidth={1.5} />;
}

export function NextScanMenu({ addon, onSetAddon, compact }: NextScanMenuProps) {
  const [open, setOpen] = useState(false);
  const [textMode, setTextMode] = useState(false);
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const selfieRef = useRef<HTMLInputElement>(null);

  const save = (type: NextScanAddon["type"], content: string) => {
    onSetAddon({ type, content, createdAt: new Date().toISOString() });
    setOpen(false);
    setTextMode(false);
    setText("");
  };

  const handleVoice = () => {
    setRecording(true);
    setTimeout(() => {
      setRecording(false);
      save("voice", MOCK_VOICE_TRANSCRIPTION);
    }, 1200);
  };

  if (addon && !open) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={`flex items-center justify-center rounded-full bg-[#f0f0f0] text-[#555] ${
          compact ? "h-7 w-7" : "absolute right-3 top-3 h-8 w-8"
        }`}
        aria-label="Next scan note"
      >
        <NextScanAddonIcon type={addon.type} />
      </button>
    );
  }

  return (
    <div className={compact ? "relative" : "absolute right-3 top-3"}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f0f0f0] text-[#666]"
        aria-label="Add for next scan"
      >
        <Plus size={16} strokeWidth={1.5} />
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40"
            onClick={() => {
              setOpen(false);
              setTextMode(false);
            }}
          />
          <div
            className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl bg-white p-2"
            style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.12)" }}
            onClick={(e) => e.stopPropagation()}
          >
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
                  onClick={() => save("text", text.trim())}
                  className="text-[13px] font-medium text-[#1a1a1a] disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            ) : (
              <>
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
                  onClick={() => selfieRef.current?.click()}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] hover:bg-[#f7f7f7]"
                >
                  <Camera size={16} strokeWidth={1.5} />
                  Add a selfie
                </button>
                <button
                  type="button"
                  onClick={handleVoice}
                  disabled={recording}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] hover:bg-[#f7f7f7] disabled:opacity-50"
                >
                  <Mic size={16} strokeWidth={1.5} />
                  {recording ? "Recording…" : "Add a voice note"}
                </button>
                {!addon && (
                  <p className="px-3 py-2 text-[10px] text-[#aaa]">For the next scan only.</p>
                )}
              </>
            )}
            {addon && !textMode && (
              <button
                type="button"
                onClick={() => {
                  onSetAddon(null);
                  setOpen(false);
                }}
                className="mt-1 w-full border-t border-[#eee] px-3 py-2 text-[12px] text-[#888]"
              >
                Remove
              </button>
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
          save("selfie", await fileToDataUrl(file));
          e.target.value = "";
        }}
      />
    </div>
  );
}
