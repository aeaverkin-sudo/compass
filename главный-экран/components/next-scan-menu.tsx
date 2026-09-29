"use client";

import { Camera, FileText, Plus, Trash2 } from "lucide-react";
import { nanoid } from "nanoid";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { orderNextScanAddons } from "@/shared/services/notes-order";
import { MAX_NEXT_SCAN_NOTES, type NextScanAddon } from "@/shared/types";
import { openSelfiePicker } from "@landing/components/photo-input-utils";

type NextScanMenuProps = {
  addons: NextScanAddon[];
  onSetAddons: (addons: NextScanAddon[]) => void;
  compact?: boolean;
  bare?: boolean;
};

/** Voice is parked in the schema for later; the UI only offers text and selfie. */
function visibleNotes(addons: NextScanAddon[]) {
  return orderNextScanAddons(addons.filter((addon) => addon.type === "text" || addon.type === "selfie"));
}

function NextScanAddonIcon({ type }: { type: "text" | "selfie" }) {
  if (type === "text") return <FileText className="size-4" strokeWidth={1} aria-hidden />;
  return <Camera className="size-4" strokeWidth={1} aria-hidden />;
}

function mediaSrc(addon: NextScanAddon): string {
  if (addon.content.startsWith("data:") || addon.content.startsWith("blob:") || addon.content.startsWith("/f/")) {
    return addon.content;
  }
  if (addon.attachmentId) return `/f/${addon.attachmentId}`;
  return "";
}

function addonPreview(addon: NextScanAddon): string {
  if (addon.type === "selfie") return "Selfie";
  return addon.content.slice(0, 48) + (addon.content.length > 48 ? "…" : "");
}

export function NextScanMenu({ addons, onSetAddons, compact, bare }: NextScanMenuProps) {
  const [open, setOpen] = useState(false);
  const [textMode, setTextMode] = useState(false);
  const [text, setText] = useState("");
  const [pickingSelfie, setPickingSelfie] = useState(false);
  const [viewing, setViewing] = useState<NextScanAddon | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const notes = visibleNotes(addons);
  const atMax = notes.length >= MAX_NEXT_SCAN_NOTES;
  const hasType = (type: "text" | "selfie") => notes.some((addon) => addon.type === type);

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
  };

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

  const commitNotes = (next: NextScanAddon[]) => {
    onSetAddons(visibleNotes(next));
  };

  const addAddon = (type: "text" | "selfie", content: string) => {
    if (notes.length >= MAX_NEXT_SCAN_NOTES || notes.some((addon) => addon.type === type)) return;
    const next: NextScanAddon = {
      id: nanoid(),
      type,
      content,
      createdAt: new Date().toISOString(),
    };
    commitNotes([...notes, next]);
    closeMenu();
  };

  const removeAddon = (id: string) => {
    commitNotes(notes.filter((addon) => addon.id !== id));
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
          if (open) closeMenu();
          else setOpen(true);
        }}
        onPointerDown={(event) => event.stopPropagation()}
        className={cn(
          "relative transition-opacity active:opacity-60",
          bare ? "flex size-6 items-center justify-center" : "compass-icon-circle size-8",
          open && "z-[60]",
        )}
      >
        <Plus className={cn(bare ? "size-5 text-[#111]" : "size-4 text-label")} strokeWidth={1} aria-hidden />
        {notes.length > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-medium leading-none text-white">
            {notes.length}
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
            className="compass-block compass-sky absolute right-0 top-full z-50 mt-2 w-64 p-2"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            role="dialog"
            aria-label="Next scan"
          >
            {viewing ? (
              <div className="p-2">
                {viewing.type === "selfie" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaSrc(viewing)} alt="" className="mb-2 aspect-square w-full object-cover" />
                ) : (
                  <p className="mb-2 text-[13px] leading-[1.35] font-normal tracking-[-0.015em] text-[#111]">{viewing.content}</p>
                )}
                <button
                  type="button"
                  onClick={() => setViewing(null)}
                  className="text-[11px] font-normal leading-none tracking-[0.1em] text-[#111] uppercase"
                >
                  Back
                </button>
              </div>
            ) : null}

            {notes.length > 0 && !textMode && !viewing ? (
              <ul className="mb-1 border-b-[0.5px] border-[#111] pb-1">
                {notes.map((addon, index) => (
                  <li key={addon.id} className="flex items-center gap-2 border-b-[0.5px] border-[#111] px-2 py-2 last:border-b-0">
                    <button
                      type="button"
                      onClick={() => {
                        setTextMode(false);
                        setViewing(addon);
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span className="w-4 shrink-0 text-[11px] font-normal leading-none tracking-[0.1em] text-[#999]">
                        {index + 1}
                      </span>
                      <NextScanAddonIcon type={addon.type === "selfie" ? "selfie" : "text"} />
                      <span className="min-w-0 flex-1 truncate whitespace-nowrap text-[13px] leading-[1.35] font-normal tracking-[-0.015em] text-[#111]">
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
                      <Trash2 className="size-4 text-[#111]" strokeWidth={1} aria-hidden />
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
                  autoCapitalize="sentences"
                  autoCorrect="off"
                  spellCheck={false}
                  className="compass-input mb-2 w-full resize-none border-b-[0.5px] border-[#111] bg-transparent text-[13px] leading-[1.35] font-normal tracking-[-0.015em] text-[#111] outline-none placeholder:text-[11px] placeholder:tracking-[0.1em] placeholder:text-[#999] placeholder:uppercase"
                />
                <button
                  type="button"
                  disabled={!text.trim()}
                  onClick={() => addAddon("text", text.trim())}
                  className="text-[11px] font-normal leading-none tracking-[0.1em] text-[#111] uppercase disabled:opacity-40"
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
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-[13px] leading-[1.35] font-normal tracking-[-0.015em] text-[#111] transition-opacity active:opacity-60"
                  >
                    <FileText className="size-4 text-[#111]" strokeWidth={1} aria-hidden />
                    Add a short text
                  </button>
                ) : null}
                {!hasType("selfie") ? (
                  <button
                    type="button"
                    disabled={pickingSelfie}
                    onClick={() => pickSelfie()}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-[13px] leading-[1.35] font-normal tracking-[-0.015em] text-[#111] transition-opacity active:opacity-60 disabled:opacity-50"
                  >
                    <Camera className="size-4 text-[#111]" strokeWidth={1} aria-hidden />
                    {pickingSelfie ? "Opening camera…" : "Add a selfie"}
                  </button>
                ) : null}
                <p className="px-3 py-2 text-[11px] font-normal leading-none tracking-[0.1em] text-[#111]">* For the next scan or share only.</p>
              </>
            ) : null}

            {atMax && !textMode && !viewing ? (
              <p className="px-3 py-2 text-[11px] font-normal leading-none tracking-[0.1em] text-[#999] uppercase">
                Maximum {MAX_NEXT_SCAN_NOTES} notes for next scan.
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
