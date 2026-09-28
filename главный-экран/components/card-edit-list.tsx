"use client";

import { Minus, Plus, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal, flushSync } from "react-dom";
import { cn } from "@/lib/utils";
import { useLongPress } from "@/shared/hooks/use-long-press";
import { groupLibrary, type CardDisplayRow, type CardZoneId } from "@/shared/services/card-zones";
import { isContactFilled } from "@/shared/services/contact-item";
import { customDisplayName } from "@/shared/services/link-display";
import { useAppStore } from "@/shared/store/app-store";
import type { Card, ContactItem } from "@/shared/types";
import { openContactAttachmentPicker } from "@landing/components/photo-input-utils";
import { AddOverlay } from "./add-overlay";

const HOLD_MS = 500;
const OFF_CARD = "#C8C8C8";
const DELETE_RED = "#E23B2F";
/** The row field grows upward to this height, then scrolls inside. */
const FIELD_MAX_PX = 120;
/** A keyboard is at least this tall; smaller viewport changes are the browser chrome. */
const KEYBOARD_MIN_PX = 120;

/** Padding that keeps an edited row on the keyboard. Does not move the page. */
function useRowKeyboardInset(active: boolean) {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (!active) return;
    const viewport = window.visualViewport;
    let remembered = 0;
    const sync = () => {
      if (!viewport) return;
      const offset = Math.max(0, viewport.offsetTop);
      const overlap = Math.max(0, window.innerHeight - offset - viewport.height);
      if (offset < 2 && overlap > KEYBOARD_MIN_PX) remembered = overlap;
      setInset(remembered > 0 ? remembered : overlap);
    };
    sync();
    viewport?.addEventListener("resize", sync);
    viewport?.addEventListener("scroll", sync);
    return () => {
      viewport?.removeEventListener("resize", sync);
      viewport?.removeEventListener("scroll", sync);
      setInset(0);
    };
  }, [active]);

  return inset;
}

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
  header,
}: {
  card: Card;
  items: ContactItem[];
  composeOnMount?: boolean;
  openAddRef?: RefObject<(() => void) | null>;
  onComposingChange?: (open: boolean) => void;
  /** Same photo and name block the card already renders. */
  header: ReactNode;
}) {
  const updateCard = useAppStore((state) => state.updateCard);
  const updateContactItem = useAppStore((state) => state.updateContactItem);
  const addItemToCard = useAppStore((state) => state.addItemToCard);
  const removeItemFromCard = useAppStore((state) => state.removeItemFromCard);
  const setCardItemOrder = useAppStore((state) => state.setCardItemOrder);
  const deleteContactItem = useAppStore((state) => state.deleteContactItem);

  const [textEditId, setTextEditId] = useState<string | null>(null);
  const [deleteReadyId, setDeleteReadyId] = useState<string | null>(null);

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
          className={cn("min-w-0 py-[18px]", index < sections.length - 1 && "border-b-[0.5px] border-[#111]")}
        >
          <div className="grid grid-cols-[86px_minmax(0,1fr)] items-baseline gap-x-[14px]">
            <span
              className="text-[11px] leading-[1.45] font-normal tracking-[0.1em] whitespace-nowrap uppercase"
              style={{ color: section.included ? "#999" : OFF_CARD }}
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
                    value={row.value}
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
        card={card}
        header={header}
        openOnMount={composeOnMount}
        openAddRef={openAddRef}
        onFocus={() => setTextEditId(null)}
        onOpenChange={(open) => onComposingChange?.(open)}
        onAdded={(itemId) => {
          if (composeOnMount) include(itemId);
        }}
      />
    </div>
  );
}

/**
 * Opens the writing overlay. Text stays here until Done, so nothing half-typed
 * reaches the card. A picked file joins the same line.
 */
function AddLine({
  card,
  header,
  openOnMount,
  openAddRef,
  onFocus,
  onOpenChange,
  onAdded,
}: {
  card: Card;
  header: ReactNode;
  openOnMount: boolean;
  /** The plate's +. Called inside the tap, so the focus still raises the keyboard. */
  openAddRef?: RefObject<(() => void) | null>;
  onFocus: () => void;
  onOpenChange: (open: boolean) => void;
  onAdded: (itemId: string) => void;
}) {
  const addContactItem = useAppStore((state) => state.addContactItem);
  const updateContactItem = useAppStore((state) => state.updateContactItem);
  const updateContactItemAttachment = useAppStore((state) => state.updateContactItemAttachment);
  const deleteContactItem = useAppStore((state) => state.deleteContactItem);

  const [opened, setOpened] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const open = !dismissed && (opened || openOnMount);
  const [text, setText] = useState("");
  const [fileItemId, setFileItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileItem = useAppStore((state) =>
    fileItemId ? state.contactItems.find((item) => item.id === fileItemId) : undefined,
  );

  const start = () => {
    setError(null);
    setDismissed(false);
    setOpened(true);
    onOpenChange(true);
  };

  useEffect(() => {
    if (!openAddRef) return;
    openAddRef.current = () => {
      flushSync(start);
    };
    return () => {
      openAddRef.current = null;
    };
  });

  useLayoutEffect(() => {
    if (open) onOpenChange(true);
  }, [open, onOpenChange]);

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
    setOpened(false);
    setDismissed(true);
    onOpenChange(false);
  };

  const takeAttachment = () => {
    openContactAttachmentPicker((dataUrl, file) => {
      const id = addContactItem();
      if (!id) return;
      const result = updateContactItemAttachment(card.id, id, file, dataUrl);
      if (result.ok) {
        setFileItemId(id);
        setError(null);
      } else {
        deleteContactItem(id);
        setError(result.message);
      }
    });
  };

  if (!open) return null;

  return (
    <AddOverlay
      card={card}
      header={header}
      text={text}
      error={error}
      fileItem={fileItem}
      onText={(value) => {
        setText(value);
        setError(null);
      }}
      onFocus={onFocus}
      onAttach={takeAttachment}
      onCommit={close}
    />
  );
}

function EditRow({
  text,
  value,
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
  value: string;
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
  const dockRef = useRef<HTMLTextAreaElement>(null);
  const dockBottom = useRowKeyboardInset(editing);
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

  const beginEdit = () => {
    openedAt.current = Date.now();
    flushSync(() => {
      setDraft(value);
      onEdit();
    });
  };

  useLayoutEffect(() => {
    if (!editing) return;
    const rect = rowRef.current?.getBoundingClientRect();
    if (rect) setFrame({ left: rect.left, width: Math.max(0, rect.width - 26) });
    dockRef.current?.focus({ preventScroll: true });
  }, [editing]);

  useLayoutEffect(() => {
    const field = dockRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, FIELD_MAX_PX)}px`;
  }, [draft, editing]);

  return (
    <div ref={rowRef} className={cn("relative min-w-0", holding && "opacity-40")}>
      <div
        ref={fieldRef}
        aria-label={text}
        data-no-swipe
        className={cn(
          "mr-[26px] block min-w-0 overflow-hidden text-[15.5px] leading-[1.45] font-normal tracking-[-0.015em] whitespace-nowrap select-none",
          editing && "pointer-events-none",
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
        {text}
      </div>
      {editing
        ? createPortal(
            <div
              data-no-swipe
              className="fixed inset-x-0 bottom-0 z-50 bg-white"
              style={{ paddingBottom: dockBottom }}
            >
              <div style={{ marginLeft: frame.left, width: frame.width }}>
                <textarea
                  ref={dockRef}
                  rows={1}
                  value={draft}
                  aria-label="Edit row"
                  enterKeyHint="done"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-no-swipe
                  onChange={(event) => {
                    const next = event.target.value.replace(/\s*\n\s*/g, " ");
                    setDraft(next);
                    if (!next.trim()) onErase();
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    onConfirm(event.currentTarget.value.replace(/\s*\n\s*/g, " "));
                  }}
                  onBlur={(event) => {
                    const next = event.currentTarget.value.replace(/\s*\n\s*/g, " ");
                    if (!next.trim()) return;
                    if (Date.now() - openedAt.current < 700) {
                      dockRef.current?.focus({ preventScroll: true });
                      return;
                    }
                    onConfirm(next);
                  }}
                  className="compass-input block w-full resize-none overflow-y-auto border-b-[0.5px] border-[#111] bg-transparent py-2 text-[15.5px] leading-[1.45] font-normal tracking-[-0.015em] text-[#111] caret-[#111] outline-none"
                />
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
