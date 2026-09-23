"use client";

import { Minus, Plus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  isContactFilled,
  isItemOnCard,
  itemDisplayValue,
  rowTypeLabel,
  sortContactList,
} from "@/shared/services/contact-item";
import { useAppStore } from "@/shared/store/app-store";
import type { Card, ContactItem } from "@/shared/types";
import { useLongPress } from "@/shared/hooks/use-long-press";
import { useVisualViewport } from "@landing/hooks/use-visual-viewport";
import { PANEL_BORDER_WIDTH_PX } from "../layout";
import { LibraryComposer } from "./library-composer";

const MENU_BUTTON_HALF_PX = 22;
const LIST_GAP_PX = 8;
const FILL_ICON_STROKE = 1;
const LIST_SCROLL_FADE_PX = 12;
const ADD_BUTTON_BOTTOM_INSET_PX = 14;
const CARD_TOGGLE_HOLD_MS = 500;
const FLY_MS = 960;

function prefersMotion() {
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function pulseHaptic() {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate(8);
  }
}

function flyBetween(from: DOMRect, to: DOMRect, text: string) {
  const ghost = document.createElement("div");
  ghost.textContent = text;
  ghost.setAttribute("aria-hidden", "true");
  ghost.style.position = "fixed";
  ghost.style.zIndex = "80";
  ghost.style.left = `${from.left}px`;
  ghost.style.top = `${from.top}px`;
  ghost.style.width = `${Math.max(from.width, 48)}px`;
  ghost.style.height = `${from.height}px`;
  ghost.style.display = "flex";
  ghost.style.alignItems = "center";
  ghost.style.overflow = "hidden";
  ghost.style.whiteSpace = "nowrap";
  ghost.style.textOverflow = "ellipsis";
  ghost.style.padding = "0 10px";
  ghost.style.borderRadius = "999px";
  ghost.style.background = "var(--sheet)";
  ghost.style.color = "var(--foreground)";
  ghost.style.fontSize = "13px";
  ghost.style.fontWeight = "600";
  ghost.style.boxShadow = "0 10px 22px rgba(20, 20, 20, 0.14)";
  ghost.style.pointerEvents = "none";
  ghost.style.transition = `transform ${FLY_MS}ms ease-out, opacity ${FLY_MS}ms ease-out`;
  document.body.appendChild(ghost);
  const dx = to.left - from.left;
  const dy = to.top - from.top;
  requestAnimationFrame(() => {
    ghost.style.transform = `translate(${dx}px, ${dy}px)`;
    ghost.style.opacity = "0";
  });
  window.setTimeout(() => ghost.remove(), FLY_MS + 40);
}

function flyItem(from: DOMRect, to: DOMRect, label: string) {
  if (!prefersMotion() || from.height === 0) return;
  flyBetween(from, to, label);
}

type LibraryFillPanelProps = {
  card: Card;
  panelTopPx: number;
  menuCenterYpx: number;
  contentWidthPx?: number;
  onComposerOpenChange?: (open: boolean) => void;
};

function CardToggleButton({
  onCard,
  onAdd,
  onRemove,
  itemId,
  listId,
  flyLabel,
}: {
  onCard: boolean;
  onAdd: () => void;
  onRemove: () => void;
  itemId: string;
  listId: string;
  flyLabel: string;
}) {
  const [holding, setHolding] = useState(false);
  const [pulsing, setPulsing] = useState(false);
  const longPress = useLongPress(() => {
    setHolding(false);
    setPulsing(true);
    window.setTimeout(() => setPulsing(false), 250);
    pulseHaptic();
    const ontoCard = !onCard;
    const from = document
      .querySelector<HTMLElement>(
        ontoCard
          ? `[data-fill-row="${CSS.escape(itemId)}"]`
          : `[data-card-chip-list="${CSS.escape(listId)}"] [data-preview-row="${CSS.escape(itemId)}"]`,
      )
      ?.getBoundingClientRect();
    if (ontoCard) onAdd();
    else onRemove();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!from) return;
        const to = document
          .querySelector<HTMLElement>(
            ontoCard
              ? `[data-card-chip-list="${CSS.escape(listId)}"] [data-preview-row="${CSS.escape(itemId)}"]`
              : `[data-fill-row="${CSS.escape(itemId)}"]`,
          )
          ?.getBoundingClientRect();
        if (!to || to.height === 0) return;
        flyItem(from, to, flyLabel);
      });
    });
  }, CARD_TOGGLE_HOLD_MS);

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
      className={cn(
        "relative flex size-[22px] shrink-0 touch-none items-center justify-center rounded-full border bg-sheet transition-transform duration-200 ease-out select-none before:absolute before:-inset-2 before:content-[''] motion-reduce:transform-none motion-reduce:transition-none",
        holding && "scale-90 bg-[rgba(20,20,20,0.06)] shadow-[0_6px_14px_rgba(20,20,20,0.14)]",
        pulsing && "compass-toggle-pulse",
        onCard ? "border-[rgba(20,20,20,0.55)]" : "border-[#D8D5CC]",
      )}
    >
      {onCard ? (
        <Minus className="size-3 text-foreground" strokeWidth={FILL_ICON_STROKE} aria-hidden />
      ) : (
        <Plus className="size-3 text-label" strokeWidth={FILL_ICON_STROKE} aria-hidden />
      )}
    </button>
  );
}

function TypeMarker({
  label,
  deleteReady,
  onArm,
  onDelete,
}: {
  label: string;
  deleteReady: boolean;
  onArm: () => void;
  onDelete: () => void;
}) {
  const [holding, setHolding] = useState(false);
  const longPress = useLongPress(() => {
    setHolding(false);
    onArm();
  }, CARD_TOGGLE_HOLD_MS);

  const release = () => {
    setHolding(false);
    longPress.onPointerUp();
  };

  return (
    <button
      type="button"
      data-delete-marker
      aria-label={deleteReady ? "Delete item" : `Hold to delete ${label}`}
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
        if (event.defaultPrevented || !deleteReady) return;
        onDelete();
      }}
      onContextMenu={longPress.onContextMenu}
      className={cn(
        "relative flex items-center justify-start whitespace-nowrap text-left text-[13px] leading-[1.4] text-label select-none",
        holding && "opacity-40",
      )}
    >
      <span className={deleteReady ? "invisible" : undefined}>{label}</span>
      {deleteReady ? (
        <X className="absolute left-0 size-3.5 text-foreground" strokeWidth={1.5} aria-hidden />
      ) : null}
    </button>
  );
}

function FilledRow({
  item,
  onCard,
  onEdit,
  onAdd,
  onRemove,
  cardId,
  deleteReady,
  onArmDelete,
  onDelete,
}: {
  item: ContactItem;
  onCard: boolean;
  onEdit: () => void;
  onAdd: () => void;
  onRemove: () => void;
  cardId: string;
  deleteReady: boolean;
  onArmDelete: () => void;
  onDelete: () => void;
}) {
  const label = rowTypeLabel(item);

  return (
    <li data-fill-row={item.id} className="col-span-3 grid grid-cols-subgrid items-stretch py-4">
      {label ? (
        <TypeMarker
          label={label}
          deleteReady={deleteReady}
          onArm={onArmDelete}
          onDelete={onDelete}
        />
      ) : (
        <span aria-hidden />
      )}
      <button
        type="button"
        onClick={onEdit}
        className={cn(
          "flex w-full min-w-0 items-center gap-2 overflow-hidden text-left text-[15px] leading-[1.5]",
          onCard ? "font-semibold text-foreground" : "font-normal text-label",
        )}
      >
        {item.type === "photo" && item.url.startsWith("data:") ? (
          <img
            src={item.url}
            alt=""
            className="size-8 shrink-0 rounded-[10px] object-cover"
          />
        ) : null}
        <span className="min-w-0 w-full truncate">
          {itemDisplayValue(item)}
        </span>
      </button>
      <div className="relative z-10 flex items-center justify-center">
        <CardToggleButton
          onCard={onCard}
          onAdd={onAdd}
          onRemove={onRemove}
          itemId={item.id}
          listId={cardId}
          flyLabel={itemDisplayValue(item)}
        />
      </div>
    </li>
  );
}

export function LibraryFillPanel({
  card,
  panelTopPx,
  menuCenterYpx,
  contentWidthPx,
  onComposerOpenChange,
}: LibraryFillPanelProps) {
  const contactItems = useAppStore((state) => state.contactItems);
  const addContactItem = useAppStore((state) => state.addContactItem);
  const updateContactItem = useAppStore((state) => state.updateContactItem);
  const updateContactItemAttachment = useAppStore((state) => state.updateContactItemAttachment);
  const addItemToCard = useAppStore((state) => state.addItemToCard);
  const removeItemFromCard = useAppStore((state) => state.removeItemFromCard);
  const deleteContactItem = useAppStore((state) => state.deleteContactItem);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteReadyId, setDeleteReadyId] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const composerOpenedAt = useRef(0);
  const listScrollRef = useRef<HTMLUListElement>(null);
  const [listScrollFadeBottom, setListScrollFadeBottom] = useState(false);
  const { keyboardOpen } = useVisualViewport();

  const syncListScrollFade = useCallback(() => {
    const el = listScrollRef.current;
    if (!el) return;

    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll <= 1) {
      setListScrollFadeBottom(false);
      return;
    }

    setListScrollFadeBottom(el.scrollTop < maxScroll - 1);
  }, []);

  const rows = useMemo(
    () => sortContactList(contactItems, card.contactItemIds),
    [contactItems, card.contactItemIds],
  );
  const filledRows = useMemo(() => rows.filter((item) => isContactFilled(item)), [rows]);
  const contentZoneHeight = Math.max(
    0,
    menuCenterYpx - panelTopPx - MENU_BUTTON_HALF_PX - LIST_GAP_PX,
  );

  const editingItem = useMemo(
    () => (editingId ? contactItems.find((item) => item.id === editingId) ?? null : null),
    [contactItems, editingId],
  );
  const composerOpen = editingItem !== null;

  const openComposer = useCallback((itemId: string) => {
    composerOpenedAt.current = Date.now();
    setAttachmentError(null);
    setDeleteReadyId(null);
    setEditingId(itemId);
  }, []);

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

  // Add a draft to the library pool (never straight onto the card) and edit it.
  const handleAddRow = () => {
    const draftId = addContactItem();
    if (draftId) openComposer(draftId);
  };

  const handleComposerBlur = useCallback(() => {
    if (!editingId) return;
    if (Date.now() - composerOpenedAt.current < 450) return;

    const item = useAppStore.getState().contactItems.find((row) => row.id === editingId);
    if (item && !isContactFilled(item)) {
      deleteContactItem(editingId);
    }
    setEditingId(null);
  }, [deleteContactItem, editingId]);

  useEffect(() => {
    onComposerOpenChange?.(composerOpen);
  }, [composerOpen, onComposerOpenChange]);

  useEffect(() => {
    return () => onComposerOpenChange?.(false);
  }, [onComposerOpenChange]);

  useEffect(() => {
    const el = listScrollRef.current;
    if (!el || composerOpen) return;

    syncListScrollFade();
    const observer = new ResizeObserver(syncListScrollFade);
    observer.observe(el);

    return () => observer.disconnect();
  }, [composerOpen, filledRows, syncListScrollFade]);

  const listWidthStyle = contentWidthPx ? { width: contentWidthPx } : undefined;

  return (
    <div className="compass-library-panel-bottom relative flex min-h-0 flex-1 flex-col">
      {composerOpen && editingItem ? (
        <div
          className="mx-auto w-full shrink-0 px-4"
          style={{ ...listWidthStyle, marginBottom: PANEL_BORDER_WIDTH_PX }}
        >
          <LibraryComposer
            item={editingItem}
            contentWidthPx={contentWidthPx}
            attachmentError={attachmentError}
            onValueChange={(value) => updateContactItem(editingItem.id, { value })}
            onLabelChange={(label) => updateContactItem(editingItem.id, { label })}
            onAttachment={(file, dataUrl) => {
              const result = updateContactItemAttachment(card.id, editingItem.id, file, dataUrl);
              if (!result.ok) {
                setAttachmentError(result.message);
                return;
              }
              setAttachmentError(null);
            }}
            onBlur={handleComposerBlur}
          />
        </div>
      ) : null}

      {composerOpen && keyboardOpen ? null : (
      <div
        className="compass-library-list mx-auto flex min-h-0 flex-col overflow-hidden px-4"
        style={{
          height: composerOpen ? undefined : contentZoneHeight,
          maxHeight: composerOpen ? undefined : contentZoneHeight,
          flex: composerOpen ? "1 1 0" : undefined,
          ...listWidthStyle,
        }}
      >
        {!composerOpen ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {filledRows.length > 0 ? (
            <div className="relative min-h-0 flex-1">
              <ul
                ref={listScrollRef}
                onScroll={syncListScrollFade}
                className="compass-library-list-scroll grid h-full min-h-0 auto-rows-min grid-cols-[auto_minmax(0,1fr)_28px] gap-x-2 divide-y divide-divider overflow-y-auto"
              >
                {filledRows.map((item) => (
                  <FilledRow
                    key={item.id}
                    item={item}
                    onCard={isItemOnCard(card, item.id)}
                    onEdit={() => openComposer(item.id)}
                    onAdd={() => addItemToCard(card.id, item.id)}
                    onRemove={() => removeItemFromCard(card.id, item.id)}
                    cardId={card.id}
                    deleteReady={deleteReadyId === item.id}
                    onArmDelete={() => setDeleteReadyId(item.id)}
                    onDelete={() => {
                      setDeleteReadyId(null);
                      deleteContactItem(item.id);
                    }}
                  />
                ))}
              </ul>
              {listScrollFadeBottom ? (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-b from-transparent to-sheet"
                  style={{ height: LIST_SCROLL_FADE_PX }}
                />
              ) : null}
            </div>
          ) : (
            <div className="min-h-0 flex-1" aria-hidden />
          )}

          <div
            className="flex shrink-0 justify-center"
            style={{ paddingBottom: ADD_BUTTON_BOTTOM_INSET_PX }}
          >
            <button
              type="button"
              data-no-swipe
              aria-label="Add contact row"
              onClick={handleAddRow}
              className={cn(
                "compass-icon-circle size-10 shrink-0 transition-opacity active:opacity-60",
                filledRows.length > 0 && "mt-2",
              )}
            >
              <Plus className="size-5 text-label" strokeWidth={FILL_ICON_STROKE} aria-hidden />
            </button>
          </div>
        </div>
        ) : null}
      </div>
      )}
    </div>
  );
}
