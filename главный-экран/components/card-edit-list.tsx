"use client";

import { Minus, Plus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useLongPress } from "@/shared/hooks/use-long-press";
import {
  groupLibrary,
  isExplicitPosition,
  parseDescription,
  type CardDisplayRow,
  type CardZoneId,
} from "@/shared/services/card-zones";
import { isContactFilled } from "@/shared/services/contact-item";
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

function isHeaderRole(row: CardDisplayRow) {
  if (!row.item) return false;
  if (row.item.type === "position" || isExplicitPosition(row.item)) return true;
  if (row.item.type !== "text") return false;
  return Boolean(parseDescription(row.value).position);
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

function HoldMark({
  onCard,
  onAdd,
  onRemove,
}: {
  onCard: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const [holding, setHolding] = useState(false);
  const longPress = useLongPress(() => {
    setHolding(false);
    if (onCard) onRemove();
    else onAdd();
  }, HOLD_MS);
  const release = () => {
    setHolding(false);
    longPress.onPointerUp();
  };

  return (
    <button
      type="button"
      data-no-swipe
      aria-label={onCard ? "Hold to remove from card" : "Hold to add to card"}
      onPointerDown={(event) => {
        setHolding(true);
        longPress.onPointerDown(event);
      }}
      onPointerMove={longPress.onPointerMove}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
      onClick={longPress.onClick}
      onContextMenu={longPress.onContextMenu}
      className={cn("flex size-5 shrink-0 items-center justify-center bg-transparent", holding && "scale-90")}
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

  const openComposer = () => {
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
          <div className="grid grid-cols-[86px_minmax(0,1fr)_26px] items-start gap-x-1.5">
            <span
              className="pt-[4px] text-[11px] font-normal tracking-[0.1em] whitespace-nowrap uppercase"
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
                    onCard={onCard}
                    first={rowIndex === 0}
                    deleteReady={deleteReadyId === item.id}
                    onArmDelete={() => setDeleteReadyId(item.id)}
                    onDelete={() => {
                      setDeleteReadyId(null);
                      deleteContactItem(item.id);
                    }}
                    onAdd={() => include(item.id)}
                    onRemove={() => removeItemFromCard(card.id, item.id)}
                    onChoose={
                      isHeaderRole(row)
                        ? () => updateCard(card.id, { headerItemId: item.id, title: item.value.trim() })
                        : undefined
                    }
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
  onCard,
  first,
  deleteReady,
  onArmDelete,
  onDelete,
  onAdd,
  onRemove,
  onChoose,
}: {
  text: string;
  onCard: boolean;
  first: boolean;
  deleteReady: boolean;
  onArmDelete: () => void;
  onDelete: () => void;
  onAdd: () => void;
  onRemove: () => void;
  onChoose?: () => void;
}) {
  const [holding, setHolding] = useState(false);
  const longPress = useLongPress(() => {
    setHolding(false);
    window.getSelection()?.removeAllRanges();
    onArmDelete();
  }, HOLD_MS);
  const release = () => {
    setHolding(false);
    longPress.onPointerUp();
  };

  return (
    <>
      <button
        type="button"
        className={cn(
          "min-w-0 py-[3px] text-left text-[15.5px] leading-[1.45] font-normal tracking-[-0.015em] break-words select-none [-webkit-touch-callout:none]",
          !first && "col-start-2",
          holding && "opacity-40",
        )}
        style={{ color: onCard ? "#111" : OFF_CARD }}
        onPointerDown={(event) => {
          if (deleteReady) return;
          setHolding(true);
          longPress.onPointerDown(event);
        }}
        onPointerMove={longPress.onPointerMove}
        onPointerUp={release}
        onPointerCancel={release}
        onPointerLeave={release}
        onClick={(event) => {
          longPress.onClick(event);
          if (event.defaultPrevented || deleteReady) return;
          onChoose?.();
        }}
        onContextMenu={longPress.onContextMenu}
      >
        {text}
      </button>
      <div className="flex items-center justify-end">
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
          <HoldMark onCard={onCard} onAdd={onAdd} onRemove={onRemove} />
        )}
      </div>
    </>
  );
}
