"use client";

import { Minus, Plus, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useLongPress } from "@/shared/hooks/use-long-press";
import { groupLibrary, type CardDisplayRow, type CardZoneId } from "@/shared/services/card-zones";
import { isContactFilled } from "@/shared/services/contact-item";
import { customDisplayName } from "@/shared/services/link-display";
import { useAppStore } from "@/shared/store/app-store";
import type { Card, ContactItem } from "@/shared/types";
import { LibraryComposer } from "./library-composer";

const HOLD_MS = 500;
const OFF_CARD = "#C8C8C8";
const DELETE_RED = "#E23B2F";

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

  return [
    ...sections.filter((section) => section.included),
    ...sections.filter((section) => !section.included && section.rows.length > 0),
  ];
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

export function CardEditList({ card, items }: { card: Card; items: ContactItem[] }) {
  const updateCard = useAppStore((state) => state.updateCard);
  const addContactItem = useAppStore((state) => state.addContactItem);
  const updateContactItem = useAppStore((state) => state.updateContactItem);
  const updateContactItemAttachment = useAppStore((state) => state.updateContactItemAttachment);
  const addItemToCard = useAppStore((state) => state.addItemToCard);
  const removeItemFromCard = useAppStore((state) => state.removeItemFromCard);
  const setCardItemOrder = useAppStore((state) => state.setCardItemOrder);
  const deleteContactItem = useAppStore((state) => state.deleteContactItem);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [textEditId, setTextEditId] = useState<string | null>(null);
  const [deleteReadyId, setDeleteReadyId] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const openedAt = useRef(0);

  const sections = useMemo(() => buildSections(card, items), [card, items]);
  const editingItem = editingId ? items.find((item) => item.id === editingId) ?? null : null;

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

  const openComposer = () => {
    setTextEditId(null);
    const id = addContactItem();
    if (!id) return;
    openedAt.current = Date.now();
    setAttachmentError(null);
    setEditingId(id);
  };

  const closeComposer = () => {
    if (!editingId) return;
    if (Date.now() - openedAt.current < 450) return;
    const item = useAppStore.getState().contactItems.find((row) => row.id === editingId);
    if (item && !isContactFilled(item)) deleteContactItem(editingId);
    setEditingId(null);
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
      {editingItem ? (
        <LibraryComposer
          viewportDock
          item={editingItem}
          attachmentError={attachmentError}
          onValueChange={(value) => updateContactItem(editingItem.id, { value })}
          onLabelChange={(label) => updateContactItem(editingItem.id, { label })}
          onAttachment={(file, dataUrl) => {
            const result = updateContactItemAttachment(card.id, editingItem.id, file, dataUrl);
            if (!result.ok) setAttachmentError(result.message);
            else setAttachmentError(null);
          }}
          onBlur={closeComposer}
        />
      ) : (
        <div
          className={cn(
            "flex justify-center pt-6 pb-2",
            sections.length > 0 && "mt-2 border-t-[0.5px] border-[#111]",
          )}
        >
          <button
            type="button"
            data-no-swipe
            aria-label="Add"
            onClick={openComposer}
            className="flex size-7 items-center justify-center bg-transparent"
          >
            <Plus className="size-7 text-[#111]" strokeWidth={1} aria-hidden />
          </button>
        </div>
      )}
    </div>
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
    if (!editing) return;
    const field = fieldRef.current;
    if (!field) return;
    field.readOnly = false;
    field.focus({ preventScroll: true });
    const end = field.value.length;
    field.setSelectionRange(end, end);
  }, [editing]);

  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    const measure = () => {
      if (editing) {
        setFades(false);
        return;
      }
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

  const beginEdit = (field: HTMLInputElement) => {
    openedAt.current = Date.now();
    setDraft(value);
    field.readOnly = false;
    field.blur();
    field.focus({ preventScroll: true });
    const end = field.value.length;
    field.setSelectionRange(end, end);
    onEdit();
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
          beginEdit(field);
        }}
        onPointerCancel={release}
        onContextMenu={longPress.onContextMenu}
      >
        {axis ? (
          <span className="shrink-0" style={{ color: onCard ? "#111" : OFF_CARD }}>
            {axis} /
          </span>
        ) : null}
        <div className="relative min-w-0 flex-1">
        <input
          ref={fieldRef}
          value={editing ? draft : value}
          readOnly={!editing}
          enterKeyHint="done"
          aria-label={editing ? "Edit row" : text}
          data-no-swipe
          onChange={(event) => {
            if (!editing) return;
            const next = event.target.value;
            if (!next.trim()) {
              onErase();
              return;
            }
            setDraft(next);
          }}
          onKeyDown={(event) => {
            if (!editing || event.key !== "Enter") return;
            event.preventDefault();
            onConfirm(event.currentTarget.value);
          }}
          onBlur={(event) => {
            if (!editing) return;
            if (Date.now() - openedAt.current < 700) {
              event.currentTarget.focus({ preventScroll: true });
              return;
            }
            onConfirm(event.currentTarget.value);
          }}
          className={cn(
            "compass-input m-0 w-full min-w-0 bg-transparent p-0 text-[16px] leading-[1.45] font-normal tracking-[-0.015em] outline-none",
            !editing && "overflow-hidden whitespace-nowrap select-none [-webkit-touch-callout:none]",
          )}
          style={{
            color: editing || onCard ? "#111" : OFF_CARD,
            caretColor: "#111",
            WebkitUserSelect: editing ? "text" : "none",
            userSelect: editing ? "text" : "none",
          }}
        />
        {!editing && fades ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-4 bg-gradient-to-r from-transparent to-white"
          />
        ) : null}
        </div>
      </div>
      <div className="flex items-center justify-end self-center">
        {deleteReady ? (
          <button
            type="button"
            data-delete-marker
            aria-label="Delete"
            onClick={onDelete}
            className="flex size-5 items-center justify-center"
          >
            <X className="size-4" strokeWidth={1.5} style={{ color: DELETE_RED }} aria-hidden />
          </button>
        ) : (
          <RowMark onCard={onCard} onAdd={onAdd} onRemove={onRemove} />
        )}
      </div>
    </>
  );
}
