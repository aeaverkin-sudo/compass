"use client";

import { Camera, FileText, Plus, Trash2 } from "lucide-react";
import { nanoid } from "nanoid";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { MarkPlus } from "@/shared/components/mark-plus";
import { orderNextScanAddons } from "@/shared/services/notes-order";
import { MAX_NEXT_SCAN_NOTES, type NextScanAddon } from "@/shared/types";
import { openSelfiePicker } from "@landing/components/photo-input-utils";

const RAIL_POPUP_GAP_PX = 8;

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
  const [place, setPlace] = useState({ right: 0, top: 0 });
  const textRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<() => void>(() => {});

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

  closeRef.current = closeMenu;

  useLayoutEffect(() => {
    if (!open || !bare) return;
    const measure = () => {
      const root = rootRef.current;
      if (!root) return;
      const trigger = root.querySelector<HTMLElement>("button[aria-label='Next scan notes']");
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const rail = root.closest("[data-side-rail]");
      const railLeft = rail?.getBoundingClientRect().left ?? rect.left;
      setPlace({
        right: Math.max(0, window.innerWidth - railLeft),
        top: rect.bottom + RAIL_POPUP_GAP_PX,
      });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, bare, textMode, viewing, notes.length]);

  useEffect(() => {
    if (!open) return;
    const inside = (target: EventTarget | null) => {
      if (!(target instanceof Node)) return false;
      if (rootRef.current?.contains(target)) return true;
      if (panelRef.current?.contains(target)) return true;
      return false;
    };
    const block = (event: PointerEvent) => {
      if (inside(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    // The plate stays up until the finger lifts, so the tap cannot open a link underneath.
    const onPointerUp = (event: PointerEvent) => {
      if (inside(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      const swallow = (click: Event) => {
        click.preventDefault();
        click.stopPropagation();
      };
      document.addEventListener("click", swallow, true);
      window.setTimeout(() => document.removeEventListener("click", swallow, true), 500);
      closeRef.current();
    };
    document.addEventListener("pointerdown", block, true);
    document.addEventListener("pointerup", onPointerUp, true);
    return () => {
      document.removeEventListener("pointerdown", block, true);
      document.removeEventListener("pointerup", onPointerUp, true);
    };
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

  const panel = (
    <div
      ref={panelRef}
      className={cn(
        "compass-block compass-sky z-50 w-max p-2 text-left",
        bare ? "fixed" : "absolute right-0 top-full mt-2",
      )}
      style={bare ? { right: place.right, top: place.top } : undefined}
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
            <p className="mb-2 t-meta text-[var(--ink)]">{viewing.content}</p>
          )}
          <button type="button" onClick={() => setViewing(null)} className="t-caps text-[var(--ink)]">
            Back
          </button>
        </div>
      ) : null}

      {notes.length > 0 && !textMode && !viewing ? (
        <ul className="mb-1 border-b border-[var(--rule)] pb-1">
          {notes.map((addon, index) => (
            <li
              key={addon.id}
              className="flex items-center gap-2 border-b border-[var(--rule)] px-2 py-2 last:border-b-0"
            >
              <button
                type="button"
                onClick={() => {
                  setTextMode(false);
                  setViewing(addon);
                }}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <span className="w-4 shrink-0 t-label">{index + 1}</span>
                <NextScanAddonIcon type={addon.type === "selfie" ? "selfie" : "text"} />
                <span className="min-w-0 flex-1 truncate whitespace-nowrap t-meta text-[var(--ink)]">
                  {addonPreview(addon)}
                </span>
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  removeAddon(addon.id);
                }}
                className="shrink-0 p-1 text-[var(--grey)] transition-opacity active:opacity-60"
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
            className="compass-input mb-2 w-full resize-none border-b border-[var(--rule)] bg-transparent t-meta text-[var(--ink)] outline-none placeholder:t-label"
          />
          <button
            type="button"
            disabled={!text.trim()}
            onClick={() => addAddon("text", text.trim())}
            className="t-caps text-[var(--ink)] disabled:opacity-40"
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
              className="flex w-full items-center px-3 py-2.5 text-left t-meta text-[var(--ink)] transition-opacity active:opacity-60"
            >
              Add a short text
            </button>
          ) : null}
          {!hasType("selfie") ? (
            <button
              type="button"
              disabled={pickingSelfie}
              onClick={() => pickSelfie()}
              className="flex w-full items-center px-3 py-2.5 text-left t-meta text-[var(--ink)] transition-opacity active:opacity-60 disabled:opacity-50"
            >
              {pickingSelfie ? "Opening camera…" : "Add a selfie"}
            </button>
          ) : null}
          <p className="whitespace-nowrap px-3 py-2 text-left t-meta text-[var(--ink)]">
            * For the next scan or share only.
          </p>
        </>
      ) : null}

      {atMax && !textMode && !viewing ? (
        <p className="px-3 py-2 t-label">Maximum {MAX_NEXT_SCAN_NOTES} notes for next scan.</p>
      ) : null}
    </div>
  );

  const dismiss = (
    <button
      type="button"
      className="fixed inset-0 z-40 bg-transparent"
      aria-label="Close menu"
      onClick={(event) => {
        event.stopPropagation();
        closeMenu();
      }}
      onPointerDown={(event) => event.stopPropagation()}
    />
  );

  const flyout =
    open && bare && typeof document !== "undefined"
      ? createPortal(
          <>
            {dismiss}
            {panel}
          </>,
          document.body,
        )
      : open
        ? (
            <>
              {dismiss}
              {panel}
            </>
          )
        : null;

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
          bare ? "flex items-center justify-center" : "compass-icon-circle size-8",
          open && "z-[60]",
        )}
      >
        {bare ? <MarkPlus /> : <Plus className="size-4 text-[var(--grey)]" strokeWidth={1} aria-hidden />}
        {notes.length > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-medium leading-none text-white">
            {notes.length}
          </span>
        ) : null}
      </button>

      {flyout}
    </div>
  );
}
