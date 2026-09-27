"use client";

import { Minus, Plus, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { cn } from "@/lib/utils";
import { useLongPress } from "@/shared/hooks/use-long-press";
import { groupLibrary, type CardDisplayRow, type CardZoneId } from "@/shared/services/card-zones";
import { isContactFilled } from "@/shared/services/contact-item";
import { customDisplayName } from "@/shared/services/link-display";
import { useAppStore } from "@/shared/store/app-store";
import type { Card, ContactItem } from "@/shared/types";
import { initialKeyboardInset, useKeyboardDock } from "@main/hooks/use-keyboard-dock";
import { openContactAttachmentPicker } from "@landing/components/photo-input-utils";
import { WrapField, type WrapFieldHandle } from "./wrap-field";

const HOLD_MS = 500;
const OFF_CARD = "#C8C8C8";
const DELETE_RED = "#E23B2F";
const ADD_PLACEHOLDER = "Add link, file, text, contact…";

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
}: {
  card: Card;
  items: ContactItem[];
  composeOnMount?: boolean;
}) {
  const updateCard = useAppStore((state) => state.updateCard);
  const updateContactItem = useAppStore((state) => state.updateContactItem);
  const addItemToCard = useAppStore((state) => state.addItemToCard);
  const removeItemFromCard = useAppStore((state) => state.removeItemFromCard);
  const setCardItemOrder = useAppStore((state) => state.setCardItemOrder);
  const deleteContactItem = useAppStore((state) => state.deleteContactItem);

  const [textEditId, setTextEditId] = useState<string | null>(null);
  const [deleteReadyId, setDeleteReadyId] = useState<string | null>(null);

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
        divided={sections.length > 0}
        onFocus={() => setTextEditId(null)}
        onAdded={(itemId) => {
          if (composeOnMount) include(itemId);
        }}
      />
    </div>
  );
}

/**
 * The only way to create a new row. At rest it is a single centred +.
 * Tapping it turns that spot into one input that owns focus until it is left.
 * Text lives here until it is committed, so nothing half-typed reaches the card.
 */
function AddLine({
  cardId,
  openOnMount,
  divided,
  onFocus,
  onAdded,
}: {
  cardId: string;
  openOnMount: boolean;
  divided: boolean;
  onFocus: () => void;
  onAdded: (itemId: string) => void;
}) {
  const addContactItem = useAppStore((state) => state.addContactItem);
  const updateContactItem = useAppStore((state) => state.updateContactItem);
  const updateContactItemAttachment = useAppStore((state) => state.updateContactItemAttachment);
  const deleteContactItem = useAppStore((state) => state.deleteContactItem);

  const [open, setOpen] = useState(false);
  const [frame, setFrame] = useState({ left: 0, width: 0 });
  const [dockBottom, setDockBottom] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<WrapFieldHandle>(null);
  useKeyboardDock(open, lineRef, setDockBottom);

  /** The docked line spans exactly the card column the + sits in. */
  const startDocking = () => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (rect) setFrame({ left: rect.left, width: rect.width });
    setDockBottom(initialKeyboardInset());
    setError(null);
    setOpen(true);
  };

  // The empty card asks for the line once, as it opens.
  useLayoutEffect(() => {
    if (openOnMount) startDocking();
  }, [openOnMount]);

  const commitText = () => {
    const field = fieldRef.current;
    const value = field?.text().trim() ?? "";
    field?.clear();
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
    commitText();
    setOpen(false);
  };

  // iOS raises the keyboard only when focus lands inside the tap itself, so the line
  // must be mounted (and already above the keyboard) before this handler returns.
  const openLine = () => {
    flushSync(startDocking);
    fieldRef.current?.focusEnd();
  };

  // The native picker always takes the keyboard away on iOS, so the docked line
  // closes with it instead of hanging mid-screen.
  const pickFile = () => {
    openContactAttachmentPicker((dataUrl, file) => {
      const id = addContactItem();
      if (!id) return;
      const result = updateContactItemAttachment(cardId, id, file, dataUrl);
      if (!result.ok) {
        deleteContactItem(id);
        setError(result.message);
      }
    });
    close();
  };

  return (
    <>
      <div
        ref={anchorRef}
        className={cn("pt-6 pb-2", divided && "mt-2 border-t-[0.5px] border-[#111]")}
      >
        {error ? <p className="mb-2 text-[12px] leading-snug text-destructive">{error}</p> : null}
        <div className="flex justify-center">
          <button
            type="button"
            data-no-swipe
            aria-label="Add"
            onClick={openLine}
            className="flex size-7 items-center justify-center bg-transparent"
          >
            <Plus className="size-7 text-[#111]" strokeWidth={1} aria-hidden />
          </button>
        </div>
      </div>
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
              <div
                className="flex items-start gap-[11px] border-b-[0.5px] border-[#111] py-2"
                style={{ marginLeft: frame.left, width: frame.width }}
              >
              <button
                type="button"
                data-no-swipe
                aria-label="Add photo or file"
                onPointerDown={(event) => event.preventDefault()}
                onClick={pickFile}
                className="flex h-[24.6px] w-7 shrink-0 items-center justify-center text-[#111]"
              >
                <Plus className="size-7 text-[#111]" strokeWidth={1} aria-hidden />
              </button>
              <WrapField
                ref={fieldRef}
                label={ADD_PLACEHOLDER}
                placeholder={ADD_PLACEHOLDER}
                autoFocus={openOnMount}
                className="text-[18.2px] leading-[1.35] font-normal tracking-[-0.015em]"
                placeholderClassName="text-[15.4px] leading-[24.6px] font-normal text-[#999]"
                onFocus={onFocus}
                onTextChange={() => setError(null)}
                onDone={() => fieldRef.current?.element()?.blur()}
                onBlur={close}
              />
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
            className="text-[16px] leading-[1.45] font-normal tracking-[-0.015em]"
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
              className="compass-input m-0 w-full min-w-0 overflow-hidden bg-transparent p-0 text-[16px] leading-[1.45] font-normal tracking-[-0.015em] whitespace-nowrap outline-none select-none [-webkit-touch-callout:none]"
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
