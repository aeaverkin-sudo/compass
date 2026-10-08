"use client";

import { CornerDownLeft, File as FileIcon, Minus, Plus, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal, flushSync } from "react-dom";
import { cn } from "@/lib/utils";
import { useLongPress } from "@/shared/hooks/use-long-press";
import { groupLibrary, inheritedLineType, orderCardZones, placeItemInZone, zoneForItem, type CardDisplayRow, type CardZoneId } from "@/shared/services/card-zones";
import { contactLineAsType, isAttachmentType, isContactFilled, messengerCountryHint, splitDraftLines } from "@/shared/services/contact-item";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/components/ui/dropdown-menu";
import { customDisplayName } from "@/shared/services/link-display";
import { useAppStore } from "@/shared/store/app-store";
import type { Card, ContactItem, ContactType } from "@/shared/types";
import { itemPhotoSrc } from "@/shared/services/card-photo";
import { useKeyboardDock } from "@main/hooks/use-keyboard-dock";
import { openContactAttachmentPicker } from "@landing/components/photo-input-utils";

const HOLD_MS = 500;
const OFF_CARD = "var(--placeholder)";
const DELETE_RED = "#E23B2F";
const ADD_PLACEHOLDER = "Add link, file, text, contact…";
const RUBRIC_CHOICES: { title: string; type: ContactType }[] = [
  { title: "Additional", type: "text" },
  { title: "Position", type: "position" },
  { title: "Web", type: "website" },
  { title: "Instagram", type: "instagram" },
  { title: "Telegram", type: "telegram" },
  { title: "WhatsApp", type: "whatsapp" },
  { title: "LinkedIn", type: "linkedin" },
  { title: "Email", type: "email" },
  { title: "Phone", type: "phone" },
  { title: "YouTube", type: "youtube" },
  { title: "TikTok", type: "tiktok" },
  { title: "X", type: "x" },
  { title: "GitHub", type: "github" },
];

function insertLineBreak(field: HTMLTextAreaElement, commit: (value: string) => void) {
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? start;
  const next = `${field.value.slice(0, start)}\n${field.value.slice(end)}`;
  commit(next);
  window.requestAnimationFrame(() => {
    field.focus({ preventScroll: true });
    field.setSelectionRange(start + 1, start + 1);
  });
}

function NewLineButton({ onPress }: { onPress: () => void }) {
  return (
    <button
      type="button"
      aria-label="New line"
      data-no-swipe
      onMouseDown={(event) => event.preventDefault()}
      onPointerDown={(event) => event.preventDefault()}
      onClick={onPress}
      className="flex h-[24.6px] w-7 shrink-0 items-center justify-center text-[var(--ink)]"
    >
      <CornerDownLeft className="size-5" strokeWidth={1.5} aria-hidden />
    </button>
  );
}
/** The writing line grows upward to this height, then scrolls inside. */
const FIELD_MAX_PX = 120;
const BLUR_GUARD_MS = 300;
const OPEN_GUARD_MS = 450;

type EditSection = {
  id: CardZoneId;
  title: string;
  included: boolean;
  rows: { row: CardDisplayRow; onCard: boolean }[];
};

function lineOf(row: CardDisplayRow) {
  return row.axis ? `${row.axis} / ${row.value}` : row.value;
}

function buildSections(card: Card, items: ContactItem[]): EditSection[] {
  const onCard = new Set(card.contactItemIds);
  const order = new Map(card.contactItemIds.map((id, index) => [id, index]));
  const grouped = groupLibrary(items.filter(isContactFilled));

  const sections = grouped.map((zone) => {
    const chosen = zone.rows
      .filter((row) => row.item && onCard.has(row.item.id))
      .sort((a, b) => (order.get(a.item!.id) ?? 0) - (order.get(b.item!.id) ?? 0));
    const spare = zone.rows
      .filter((row) => row.item && !onCard.has(row.item.id))
      .sort((a, b) => (a.item!.order ?? 0) - (b.item!.order ?? 0));
    return {
      id: zone.id,
      title: zone.title,
      included: chosen.length > 0,
      rows: [
        ...chosen.map((row) => ({ row, onCard: true })),
        ...spare.map((row) => ({ row, onCard: false })),
      ],
    };
  });

  return sections.filter((section) => section.rows.length > 0);
}

function RowMark({
  onCard,
  onAdd,
  onRemove,
}: {
  onCard: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      data-no-swipe
      aria-label={onCard ? "Remove from portfolio" : "Add to portfolio"}
      onClick={() => {
        if (onCard) onRemove();
        else onAdd();
      }}
      className="flex size-5 shrink-0 items-center justify-center bg-transparent"
    >
      {onCard ? (
        <Minus className="size-5 text-[#111]" strokeWidth={1} aria-hidden />
      ) : (
        <Plus className="size-5" strokeWidth={1} style={{ color: OFF_CARD }} aria-hidden />
      )}
    </button>
  );
}

export function CardEditList({
  card,
  items,
  composeOnMount = false,
  openAddRef,
  onComposingChange,
}: {
  card: Card;
  items: ContactItem[];
  composeOnMount?: boolean;
  openAddRef?: RefObject<(() => void) | null>;
  onComposingChange?: (open: boolean) => void;
}) {
  const updateCard = useAppStore((state) => state.updateCard);
  const updateContactItem = useAppStore((state) => state.updateContactItem);
  const setContactItem = useAppStore((state) => state.setContactItem);
  const setContactItemType = useAppStore((state) => state.setContactItemType);
  const addContactItem = useAppStore((state) => state.addContactItem);
  const addItemToCard = useAppStore((state) => state.addItemToCard);
  const removeItemFromCard = useAppStore((state) => state.removeItemFromCard);
  const setCardItemOrder = useAppStore((state) => state.setCardItemOrder);
  const deleteContactItem = useAppStore((state) => state.deleteContactItem);

  const [textEditId, setTextEditId] = useState<string | null>(null);
  const [deleteReadyId, setDeleteReadyId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  useEffect(() => () => onComposingChange?.(false), [onComposingChange]);

  const sections = useMemo(
    () => orderCardZones(buildSections(card, items), card.rubricOrder),
    [card, items],
  );

  useEffect(() => {
    if (!deleteReadyId) return;
    const dismiss = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-delete-marker]")) return;
      setDeleteReadyId(null);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [deleteReadyId]);

  const include = useCallback(
    (itemId: string) => {
      addItemToCard(card.id, itemId);
      const next = useAppStore.getState().cards.find((entry) => entry.id === card.id);
      if (!next) return;
      const rest = next.contactItemIds.filter((id) => id !== itemId);
      setCardItemOrder(card.id, [...rest, itemId]);
    },
    [addItemToCard, card.id, setCardItemOrder],
  );

  const saveRowText = (item: ContactItem, shown: string, next: string) => {
    const pieces = splitDraftLines(next);
    const lines = isAttachmentType(item.type) ? [pieces.join(" ")].filter(Boolean) : pieces;
    const first = lines[0];
    if (!first) return;
    const rest = lines.slice(1);
    if (rest.length === 0) {
      if (first === shown) return;
      const stored =
        customDisplayName(item) ||
        (shown !== item.value.trim() &&
          item.type !== "text" &&
          item.type !== "position" &&
          item.type !== "email" &&
          item.type !== "phone");
      updateContactItem(item.id, stored ? { label: first } : { value: first });
      if (card.headerItemId === item.id) updateCard(card.id, { title: first });
      return;
    }
    const inherit = inheritedLineType(item);
    if (inherit) setContactItem({ ...contactLineAsType(item, first, inherit), label: item.label, typeManual: true });
    else if (first !== shown) updateContactItem(item.id, { value: first });
    if (card.headerItemId === item.id) updateCard(card.id, { title: first });
    for (const line of rest) {
      const id = addContactItem();
      if (!id) continue;
      const seed = useAppStore.getState().contactItems.find((row) => row.id === id);
      if (!seed) continue;
      if (inherit) setContactItem({ ...contactLineAsType(seed, line, inherit), typeManual: true });
      else updateContactItem(id, { value: line });
      const created = useAppStore.getState().contactItems.find((row) => row.id === id);
      if (!created || !isContactFilled(created)) {
        deleteContactItem(id);
        continue;
      }
      include(id);
    }
  };

  const renameRow = (item: ContactItem, next: string, shown: string) => {
    const trimmed = next.trim();
    const current = item.label.trim();
    if (trimmed === current || (trimmed === shown && !current)) return;
    updateContactItem(item.id, { label: trimmed });
  };

  const retargetRow = (item: ContactItem, type: ContactType) => {
    const moved = setContactItemType(item.id, type);
    if (!moved) return;
    const state = useAppStore.getState();
    const nextItem = state.contactItems.find((entry) => entry.id === item.id);
    const nextCard = state.cards.find((entry) => entry.id === card.id);
    if (!nextItem || !nextCard) return;
    const zone = zoneForItem(nextItem);
    const zoneIds = nextCard.contactItemIds.filter((id) => {
      if (id === item.id) return false;
      const row = state.contactItems.find((entry) => entry.id === id);
      return Boolean(row && zoneForItem(row) === zone);
    });
    setCardItemOrder(card.id, placeItemInZone(nextCard.contactItemIds, item.id, zoneIds));
  };

  const eraseRow = (itemId: string) => {
    if (card.headerItemId === itemId) updateCard(card.id, { headerItemId: undefined, title: "" });
    setTextEditId(null);
    setDeleteReadyId(null);
    deleteContactItem(itemId);
  };

  return (
    <div data-card-chip-list={card.id} data-card-content>
      {sections.map((section, index) => (
        <section
          key={section.id}
          hidden={composing}
          className={cn("min-w-0 py-[18px]", index < sections.length - 1 && "border-b border-[var(--rule)]")}
        >
          <div className="grid grid-cols-[86px_minmax(0,1fr)] items-baseline gap-x-[14px]">
            <span
              className="t-label whitespace-nowrap"
              style={{ color: section.included ? "var(--grey)" : OFF_CARD }}
            >
              {section.title}
            </span>
            <div className="flex min-w-0 flex-col gap-[6px]">
              {section.rows.map(({ row, onCard }) => {
                const item = row.item;
                if (!item) return null;
                return (
                  <EditRow
                    key={item.id}
                    text={lineOf(row)}
                    label={item.label.trim() || row.axis || section.title}
                    value={row.value}
                    choices={isAttachmentType(item.type) ? [] : RUBRIC_CHOICES}
                    onRename={(next) => renameRow(item, next, item.label.trim() || row.axis || section.title)}
                    onRetype={(type) => retargetRow(item, type)}
                    onCard={onCard}
                    editing={textEditId === item.id}
                    deleteReady={deleteReadyId === item.id}
                    onArmDelete={() => setDeleteReadyId(item.id)}
                    onDelete={() => eraseRow(item.id)}
                    onAdd={() => include(item.id)}
                    onRemove={() => removeItemFromCard(card.id, item.id)}
                    onEdit={() => {
                      setDeleteReadyId(null);
                      setTextEditId(item.id);
                    }}
                    onConfirm={(next) => {
                      saveRowText(item, row.value, next);
                      setTextEditId(null);
                    }}
                    onErase={() => eraseRow(item.id)}
                  />
                );
              })}
            </div>
          </div>
        </section>
      ))}
      <AddLine
        cardId={card.id}
        openOnMount={composeOnMount}
        openAddRef={openAddRef}
        onFocus={() => setTextEditId(null)}
        onOpenChange={(open) => {
          setComposing(open);
          onComposingChange?.(open);
        }}
        onAdded={(itemId) => {
          const first = useAppStore.getState().cards[0];
          if (first?.id === card.id) include(itemId);
        }}
      />
    </div>
  );
}

/**
 * The only way to create a new row. At rest it is a single centred +.
 * Tapping it docks one writing line above the keyboard. Enter starts another line.
 * Closing the line saves each line as its own record. A picked file joins the same line.
 */
function AddLine({
  cardId,
  openOnMount,
  openAddRef,
  onFocus,
  onOpenChange,
  onAdded,
}: {
  cardId: string;
  openOnMount: boolean;
  /** The plate's +. Called inside the tap, so the focus still raises the keyboard. */
  openAddRef?: RefObject<(() => void) | null>;
  onFocus: () => void;
  /** While open, the card shows only the QR, the photo and the name above the line. */
  onOpenChange: (open: boolean) => void;
  onAdded: (itemId: string) => void;
}) {
  const addContactItem = useAppStore((state) => state.addContactItem);
  const updateContactItem = useAppStore((state) => state.updateContactItem);
  const updateContactItemAttachment = useAppStore((state) => state.updateContactItemAttachment);
  const deleteContactItem = useAppStore((state) => state.deleteContactItem);

  const [open, setOpen] = useState(false);
  const [frame, setFrame] = useState({ left: 0, width: 0 });
  const [text, setText] = useState("");
  const [fileItemId, setFileItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const fileItem = useAppStore((state) =>
    fileItemId ? state.contactItems.find((item) => item.id === fileItemId) : undefined,
  );
  const anchorRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const picking = useRef(false);
  const openedAt = useRef(0);
  const closedRef = useRef(false);
  const dockBottom = useKeyboardDock(open, true);
  const filePhoto = fileItem ? itemPhotoSrc(fileItem) : null;

  /** The docked line spans exactly the card column. */
  const startDocking = () => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (rect) setFrame({ left: rect.left, width: rect.width });
    openedAt.current = Date.now();
    closedRef.current = false;
    setError(null);
    setHint(null);
    setOpen(true);
    onOpenChange(true);
  };

  useEffect(() => {
    if (!openAddRef) return;
    openAddRef.current = () => {
      flushSync(startDocking);
      fieldRef.current?.focus({ preventScroll: true });
    };
    return () => {
      openAddRef.current = null;
    };
  });

  // The empty card asks for the line once, as it opens.
  useLayoutEffect(() => {
    if (openOnMount) startDocking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openOnMount]);

  // Layout phase: mounted from a tap, the focus still counts as the user's and raises the keyboard.
  useLayoutEffect(() => {
    if (open) fieldRef.current?.focus({ preventScroll: true });
  }, [open]);

  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, FIELD_MAX_PX)}px`;
  }, [text, open]);

  const dismissLine = () => {
    if (closedRef.current) return;
    closedRef.current = true;
    setText("");
    setFileItemId(null);
    setOpen(false);
    onOpenChange(false);
  };

  /** A chosen file leaves the writing line. The card body shows it, and OK confirms the edit. */
  const placeFile = (itemId: string) => {
    const value = splitDraftLines(text).join(" ");
    if (value) updateContactItem(itemId, { label: value });
    onAdded(itemId);
    picking.current = false;
    dismissLine();
  };

  const commit = () => {
    const lines = splitDraftLines(text);
    if (fileItemId) {
      const caption = lines.join(" ");
      if (caption) updateContactItem(fileItemId, { label: caption });
      onAdded(fileItemId);
      return true;
    }
    if (lines.length === 0) return true;
    for (const line of lines) {
      const countryHint = messengerCountryHint(line);
      if (countryHint) {
        setHint(countryHint);
        return false;
      }
    }
    for (const line of lines) {
      const id = addContactItem();
      if (!id) return true;
      updateContactItem(id, { value: line });
      const item = useAppStore.getState().contactItems.find((row) => row.id === id);
      if (!item || !isContactFilled(item)) {
        deleteContactItem(id);
        continue;
      }
      onAdded(id);
    }
    return true;
  };

  const close = () => {
    if (closedRef.current) return;
    if (!commit()) return;
    dismissLine();
  };

  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });

  // A tap anywhere but the writing row leaves the line. The blue plate stays up
  // until the finger lifts, so the tap cannot fall through onto a row underneath.
  useEffect(() => {
    if (!open) return;
    const inside = (target: EventTarget | null) => target instanceof Node && !!rowRef.current?.contains(target);
    const onPointerDown = (event: PointerEvent) => {
      if (inside(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
    };
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
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", onPointerUp, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", onPointerUp, true);
    };
  }, [open]);

  // iOS may hand focus around while the keyboard settles or a full-screen picker is up;
  // the line closes only once focus has really left it.
  const handleBlur = () => {
    window.setTimeout(() => {
      if (picking.current) return;
      if (Date.now() - openedAt.current < OPEN_GUARD_MS) return;
      if (lineRef.current?.contains(document.activeElement)) return;
      close();
    }, BLUR_GUARD_MS);
  };

  const raiseKeyboard = () => {
    const field = fieldRef.current;
    if (!field) return;
    field.blur();
    field.focus({ preventScroll: true });
  };

  const refocus = () => {
    // Same turn as the sheet's cancel, same move as a tap on the line.
    raiseKeyboard();
    window.setTimeout(() => {
      picking.current = false;
    }, BLUR_GUARD_MS);
  };

  const takeAttachment = () => {
    picking.current = true;
    openContactAttachmentPicker((dataUrl, file) => {
      const id = addContactItem();
      if (!id) return;
      const result = updateContactItemAttachment(cardId, id, file, dataUrl);
      if (result.ok) {
        setError(null);
        placeFile(id);
      } else {
        deleteContactItem(id);
        setError(result.message);
      }
    }, () => {
      if (closedRef.current) return;
      refocus();
    });
    const field = fieldRef.current;
    if (field && document.activeElement !== field) field.focus({ preventScroll: true });
  };

  return (
    <>
      <div ref={anchorRef} className="h-0" aria-hidden />
      {open
        ? createPortal(
            // White from the line to the screen bottom. A short fade above the text dissolves the header.
            <div
              ref={lineRef}
              data-no-swipe
              className="fixed inset-x-0 bottom-0 z-50 bg-[#fff]"
              style={{ paddingBottom: dockBottom }}
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-full h-11 bg-gradient-to-t from-[#fff] to-transparent"
              />
              <div style={{ marginLeft: frame.left, width: frame.width }}>
                {error ? <p className="pt-2 t-meta text-destructive">{error}</p> : null}
                {hint ? <p className="pt-2 t-meta text-[var(--ink)]">{hint}</p> : null}
                <div ref={rowRef} className="flex items-start gap-[11px] border-b border-[var(--rule)] py-2">
                  {filePhoto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={filePhoto} alt="" className="size-10 shrink-0 object-cover" />
                  ) : fileItem ? (
                    <FileIcon className="size-7 shrink-0 text-[#111]" strokeWidth={1} aria-hidden />
                  ) : (
                    <button
                      type="button"
                      data-no-swipe
                      aria-label="Add photo or file"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={takeAttachment}
                      className="flex h-[24.6px] w-7 shrink-0 items-center justify-center text-[#111]"
                    >
                      <Plus className="size-7 text-[#111]" strokeWidth={1} aria-hidden />
                    </button>
                  )}
                  <textarea
                    ref={fieldRef}
                    rows={1}
                    value={text}
                    placeholder={fileItem ? fileItem.value : ADD_PLACEHOLDER}
                    aria-label={ADD_PLACEHOLDER}
                    enterKeyHint="enter"
                    autoCorrect="off"
                    autoCapitalize="sentences"
                    spellCheck={false}
                    data-no-swipe
                    onPointerDown={() => {
                      const vv = window.visualViewport;
                      if (!vv) return;
                      const overlap = window.innerHeight - vv.offsetTop - vv.height;
                      if (overlap > 120) return;
                      raiseKeyboard();
                    }}
                    onChange={(event) => {
                      setText(event.target.value);
                      setError(null);
                      setHint(null);
                    }}
                    onFocus={onFocus}
                    onBlur={handleBlur}
                    className="compass-input block min-w-0 flex-1 resize-none overflow-y-auto bg-transparent p-0 t-body text-[var(--ink)] caret-[var(--ink)] outline-none placeholder:text-[var(--grey)]"
                    style={{ fontSize: 16, lineHeight: "normal" }}
                  />
                  <NewLineButton
                    onPress={() => {
                      const field = fieldRef.current;
                      if (!field) return;
                      insertLineBreak(field, setText);
                    }}
                  />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function EditRow({
  text,
  label,
  value,
  choices,
  onRename,
  onRetype,
  onCard,
  editing,
  deleteReady,
  onArmDelete,
  onDelete,
  onAdd,
  onRemove,
  onEdit,
  onConfirm,
  onErase,
}: {
  text: string;
  label: string;
  value: string;
  choices: { title: string; type: ContactType }[];
  onRename: (next: string) => void;
  onRetype: (type: ContactType) => void;
  onCard: boolean;
  editing: boolean;
  deleteReady: boolean;
  onArmDelete: () => void;
  onDelete: () => void;
  onAdd: () => void;
  onRemove: () => void;
  onEdit: () => void;
  onConfirm: (next: string) => void;
  onErase: () => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLTextAreaElement>(null);
  const dockBottom = useKeyboardDock(editing, true);
  const [frame, setFrame] = useState({ left: 0, width: 0 });
  const pressedLong = useRef(false);
  const openedAt = useRef(0);
  const [holding, setHolding] = useState(false);
  const [draft, setDraft] = useState(value);
  const [fades, setFades] = useState(false);
  const longPress = useLongPress(() => {
    pressedLong.current = true;
    setHolding(false);
    window.getSelection()?.removeAllRanges();
    onArmDelete();
  }, HOLD_MS);
  const release = () => {
    setHolding(false);
    longPress.onPointerUp();
  };

  useLayoutEffect(() => {
    const field = fieldRef.current;
    const line = lineRef.current;
    if (!field || !line) return;
    const measure = () => {
      const next = line.scrollWidth > field.clientWidth + 1;
      setFades((current) => (current === next ? current : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(field);
    return () => observer.disconnect();
  }, [editing, text, value]);

  const beginEdit = () => {
    openedAt.current = Date.now();
    flushSync(() => {
      setDraft(value);
      onEdit();
    });
  };

  useLayoutEffect(() => {
    if (!editing) return;
    const list = rowRef.current?.closest("[data-card-chip-list]");
    const rect = list?.getBoundingClientRect();
    if (rect) setFrame({ left: rect.left, width: rect.width });
    dockRef.current?.focus({ preventScroll: true });
  }, [editing]);

  useLayoutEffect(() => {
    const field = dockRef.current;
    if (!field || !editing || frame.width < 1) return;
    field.style.height = "0px";
    field.style.height = `${Math.min(field.scrollHeight, FIELD_MAX_PX)}px`;
  }, [draft, editing, frame.width]);

  return (
    <div ref={rowRef} className={cn("relative flex min-w-0 items-baseline gap-2", holding && "opacity-40")}>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Label ${label}`}
          data-no-swipe
          onPointerDown={(event) => event.stopPropagation()}
          className="shrink-0 t-label text-[var(--grey)]"
        >
          {label}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <div className="px-3 py-2" onKeyDown={(event) => event.stopPropagation()}>
            <input
              defaultValue={label}
              aria-label="Row label"
              className="w-full bg-transparent t-body text-[#111] outline-none"
              onBlur={(event) => onRename(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                onRename(event.currentTarget.value);
              }}
            />
          </div>
          {choices.map((choice) => (
            <DropdownMenuItem key={choice.type} onSelect={() => onRetype(choice.type)}>
              {choice.title}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <div
        ref={fieldRef}
        aria-label={text}
        data-no-swipe
        className={cn(
          "mr-[26px] min-w-0 overflow-clip",
          editing && "invisible pointer-events-none",
        )}
        style={{ color: onCard ? "#111" : OFF_CARD }}
        onPointerDown={(event) => {
          if (editing || deleteReady) return;
          pressedLong.current = false;
          setHolding(true);
          longPress.onPointerDown(event);
        }}
        onPointerMove={longPress.onPointerMove}
        onPointerUp={(event) => {
          release();
          if (editing || pressedLong.current || deleteReady) return;
          if (!(event.target instanceof Node) || !fieldRef.current?.contains(event.target)) return;
          beginEdit();
        }}
        onPointerCancel={release}
        onContextMenu={longPress.onContextMenu}
      >
        <div
          ref={lineRef}
          className="w-max whitespace-nowrap t-body select-none"
        >
          {value}
        </div>
      </div>
      {editing
        ? createPortal(
            <div
              data-no-swipe
              className="fixed inset-x-0 bottom-0 z-50 bg-[#fff]"
              style={{ paddingBottom: dockBottom }}
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-full h-11 bg-gradient-to-t from-[#fff] to-transparent"
              />
              <div style={{ marginLeft: frame.left, width: frame.width }}>
                <div className="flex items-end gap-[11px] border-b border-[var(--rule)]">
                  <textarea
                    ref={dockRef}
                    rows={1}
                    value={draft}
                    aria-label="Edit row"
                    enterKeyHint="enter"
                    autoCorrect="off"
                    autoCapitalize="sentences"
                    spellCheck={false}
                    data-no-swipe
                    onChange={(event) => {
                      const next = event.target.value;
                      setDraft(next);
                      if (!next.trim()) onErase();
                    }}
                    onBlur={(event) => {
                      const next = event.currentTarget.value;
                      if (!next.trim()) return;
                      if (Date.now() - openedAt.current < 700) {
                        dockRef.current?.focus({ preventScroll: true });
                        return;
                      }
                      onConfirm(next);
                    }}
                    className="compass-input block min-w-0 flex-1 resize-none overflow-y-auto bg-transparent t-body text-[var(--ink)] caret-[var(--ink)] outline-none"
                  />
                  <NewLineButton
                    onPress={() => {
                      const field = dockRef.current;
                      if (!field) return;
                      insertLineBreak(field, setDraft);
                    }}
                  />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
      {fades && !editing ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-[26px] w-4 bg-gradient-to-r from-transparent to-white"
        />
      ) : null}
      <div className="absolute inset-y-0 right-0 flex items-center">
        {deleteReady ? (
          <button
            type="button"
            data-delete-marker
            aria-label="Delete"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onDelete}
            className="relative z-10 -m-2.5 flex size-10 items-center justify-center"
          >
            <X className="pointer-events-none size-4" strokeWidth={1.5} style={{ color: DELETE_RED }} aria-hidden />
          </button>
        ) : (
          <RowMark onCard={onCard} onAdd={onAdd} onRemove={onRemove} />
        )}
      </div>
    </div>
  );
}
