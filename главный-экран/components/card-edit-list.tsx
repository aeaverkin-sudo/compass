"use client";

import { File as FileIcon, Minus, Plus, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal, flushSync } from "react-dom";
import { cn } from "@/lib/utils";
import { useLongPress } from "@/shared/hooks/use-long-press";
import { groupLibrary, type CardDisplayRow, type CardZoneId } from "@/shared/services/card-zones";
import { isContactFilled } from "@/shared/services/contact-item";
import { customDisplayName } from "@/shared/services/link-display";
import { useAppStore } from "@/shared/store/app-store";
import type { Card, ContactItem } from "@/shared/types";
import { itemPhotoSrc } from "@/shared/services/card-photo";
import { useKeyboardDock } from "@main/hooks/use-keyboard-dock";
import { openContactAttachmentPicker } from "@landing/components/photo-input-utils";
import { WrapField, type WrapFieldHandle } from "./wrap-field";

const HOLD_MS = 500;
const OFF_CARD = "#C8C8C8";
const DELETE_RED = "#E23B2F";
const ADD_PLACEHOLDER = "Add link, file, text, contact…";
/** The add line grows upward to this height, then scrolls inside. */
const FIELD_MAX_PX = 120;
const BLUR_GUARD_MS = 300;
const OPEN_GUARD_MS = 450;
const REFOCUS_MS = 120;

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
      aria-label={onCard ? "Remove from card" : "Add to card"}
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
  const addItemToCard = useAppStore((state) => state.addItemToCard);
  const removeItemFromCard = useAppStore((state) => state.removeItemFromCard);
  const setCardItemOrder = useAppStore((state) => state.setCardItemOrder);
  const deleteContactItem = useAppStore((state) => state.deleteContactItem);

  const [textEditId, setTextEditId] = useState<string | null>(null);
  const [deleteReadyId, setDeleteReadyId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  useEffect(() => () => onComposingChange?.(false), [onComposingChange]);

  const sections = useMemo(() => buildSections(card, items), [card, items]);

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
    const trimmed = next.trim();
    if (!trimmed || trimmed === shown) return;
    const stored =
      customDisplayName(item) ||
      (shown !== item.value.trim() &&
        item.type !== "text" &&
        item.type !== "position" &&
        item.type !== "email" &&
        item.type !== "phone");
    updateContactItem(item.id, stored ? { label: trimmed } : { value: trimmed });
    if (card.headerItemId === item.id) updateCard(card.id, { title: trimmed });
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
          className={cn("min-w-0 py-[18px]", index < sections.length - 1 && "border-b-[0.5px] border-[#111]")}
        >
          <div className="grid grid-cols-[86px_minmax(0,1fr)_26px] items-baseline gap-x-[14px]">
            <span
              className="text-[11px] leading-[1.45] font-normal tracking-[0.1em] whitespace-nowrap uppercase"
              style={{ color: section.included ? "#999" : OFF_CARD }}
            >
              {section.title}
            </span>
            <div className="contents">
              {section.rows.map(({ row, onCard }, rowIndex) => {
                const item = row.item;
                if (!item) return null;
                return (
                  <EditRow
                    key={item.id}
                    text={lineOf(row)}
                    value={row.value}
                    axis={row.axis}
                    onCard={onCard}
                    first={rowIndex === 0}
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
          if (composeOnMount) include(itemId);
        }}
      />
    </div>
  );
}

/**
 * The only way to create a new row. At rest it is a single centred +.
 * Tapping it docks one writing line above the keyboard. Text stays here until Done,
 * so nothing half-typed reaches the card. A picked file joins the same line.
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
  const fileItem = useAppStore((state) =>
    fileItemId ? state.contactItems.find((item) => item.id === fileItemId) : undefined,
  );
  const anchorRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const picking = useRef(false);
  const openedAt = useRef(0);
  const dockBottom = useKeyboardDock(open);
  const filePhoto = fileItem ? itemPhotoSrc(fileItem) : null;

  /** The docked line spans exactly the card column. */
  const startDocking = () => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (rect) setFrame({ left: rect.left, width: rect.width });
    openedAt.current = Date.now();
    setError(null);
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

  const commit = () => {
    const value = text.trim();
    if (fileItemId) {
      if (value) updateContactItem(fileItemId, { label: value });
      onAdded(fileItemId);
      return;
    }
    if (!value) return;
    const id = addContactItem();
    if (!id) return;
    updateContactItem(id, { value });
    const item = useAppStore.getState().contactItems.find((row) => row.id === id);
    if (!item || !isContactFilled(item)) {
      deleteContactItem(id);
      return;
    }
    onAdded(id);
  };

  const close = () => {
    commit();
    setText("");
    setFileItemId(null);
    setOpen(false);
    onOpenChange(false);
  };

  // No tap may take focus from the field: the keyboard, the line and the caret stay put
  // (closing the attach menu included). Only Done leaves the line.
  useEffect(() => {
    if (!open) return;
    const keepFocus = (event: MouseEvent) => {
      if (event.target !== fieldRef.current) event.preventDefault();
    };
    document.addEventListener("mousedown", keepFocus, true);
    return () => document.removeEventListener("mousedown", keepFocus, true);
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

  const refocus = () => {
    window.setTimeout(() => {
      picking.current = false;
      fieldRef.current?.focus({ preventScroll: true });
    }, REFOCUS_MS);
  };

  const pickFile = () => {
    picking.current = true;
    openContactAttachmentPicker((dataUrl, file) => {
      const id = addContactItem();
      if (!id) return;
      const result = updateContactItemAttachment(cardId, id, file, dataUrl);
      if (result.ok) {
        setFileItemId(id);
        setError(null);
      } else {
        deleteContactItem(id);
        setError(result.message);
      }
    }, refocus);
    // Still inside the tap: if iOS moved focus anyway, taking it back keeps the keyboard up.
    fieldRef.current?.focus({ preventScroll: true });
  };

  return (
    <>
      <div ref={anchorRef} className="h-0" aria-hidden />
      {open
        ? createPortal(
            // White from the line to the screen bottom, so nothing of the card shows
            // between the line and the keyboard or through the keyboard's glass.
            <div
              ref={lineRef}
              data-no-swipe
              className="fixed inset-x-0 bottom-0 z-50 bg-white"
              style={{ paddingBottom: dockBottom }}
            >
              <div style={{ marginLeft: frame.left, width: frame.width }}>
                {error ? <p className="pt-2 text-[12px] leading-snug text-destructive">{error}</p> : null}
                <div className="flex items-start gap-[11px] border-b-[0.5px] border-[#111] py-2">
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
                      onClick={pickFile}
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
                    enterKeyHint="done"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    data-no-swipe
                    onChange={(event) => {
                      setText(event.target.value.replace(/\s*\n\s*/g, " "));
                      setError(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      event.currentTarget.blur();
                    }}
                    onFocus={onFocus}
                    onBlur={handleBlur}
                    className="compass-input block min-w-0 flex-1 resize-none overflow-y-auto bg-transparent text-[18.2px] leading-[1.35] font-normal tracking-[-0.015em] text-[#111] caret-[#111] outline-none placeholder:text-[15.4px] placeholder:font-normal placeholder:text-[#999]"
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
  value,
  axis,
  onCard,
  first,
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
  value: string;
  axis: string;
  onCard: boolean;
  first: boolean;
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
  const fieldRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<WrapFieldHandle>(null);
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
    if (!field) return;
    const measure = () => {
      field.scrollLeft = 0;
      const next = field.scrollWidth > field.clientWidth + 1;
      setFades((current) => (current === next ? current : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(field);
    return () => observer.disconnect();
  }, [editing, value]);

  const lineClass = cn(
    "min-w-0 py-[3px] text-left text-[15.5px] leading-[1.45] font-normal tracking-[-0.015em]",
    !first && "col-start-2",
  );

  const beginEdit = () => {
    openedAt.current = Date.now();
    flushSync(() => {
      setDraft(value);
      onEdit();
    });
  };

  return (
    <>
      <div
        className={cn(lineClass, "flex min-w-0 items-baseline gap-1", holding && "opacity-40")}
        onPointerDown={(event) => {
          if (editing || deleteReady) return;
          pressedLong.current = false;
          setHolding(true);
          longPress.onPointerDown(event);
        }}
        onPointerMove={longPress.onPointerMove}
        onPointerUp={(event) => {
          release();
          const field = fieldRef.current;
          if (!field || editing || pressedLong.current || deleteReady) return;
          if (!(event.target instanceof Node) || !field.contains(event.target)) return;
          beginEdit();
        }}
        onPointerCancel={release}
        onContextMenu={longPress.onContextMenu}
      >
        {axis ? (
          <span className="shrink-0" style={{ color: onCard ? "#111" : OFF_CARD }}>
            {axis} /
          </span>
        ) : null}
        {editing ? (
          <WrapField
            ref={editorRef}
            initial={draft}
            label="Edit row"
            autoFocus
            className="text-[15.5px] leading-[1.45] font-normal tracking-[-0.015em]"
            onTextChange={(next) => {
              if (!next.trim()) onErase();
            }}
            onDone={onConfirm}
            onBlur={(next) => {
              if (Date.now() - openedAt.current < 700) {
                editorRef.current?.focusEnd();
                return;
              }
              onConfirm(next);
            }}
          />
        ) : (
          <div className="relative min-w-0 flex-1">
            <input
              ref={fieldRef}
              value={value}
              readOnly
              aria-label={text}
              data-no-swipe
              className="compass-input m-0 w-full min-w-0 overflow-hidden bg-transparent p-0 text-[15.5px] leading-[1.45] font-normal tracking-[-0.015em] whitespace-nowrap outline-none select-none [-webkit-touch-callout:none]"
              style={{ color: onCard ? "#111" : OFF_CARD }}
            />
            {fades ? (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-0 w-4 bg-gradient-to-r from-transparent to-white"
              />
            ) : null}
          </div>
        )}
      </div>
      <div className="flex items-center justify-end self-center">
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
    </>
  );
}
