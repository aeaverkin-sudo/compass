"use client";

import { Minus, Plus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { groupLibrary } from "@/shared/services/card-zones";
import {
  isContactFilled,
  isItemOnCard,
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

function FilledRow({
  lead,
  spaced,
  mark,
  value,
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
  lead: string;
  spaced: boolean;
  mark: string;
  value: string;
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
  const [holding, setHolding] = useState(false);
  const longPress = useLongPress(() => {
    setHolding(false);
    onArmDelete();
  }, CARD_TOGGLE_HOLD_MS);
  const release = () => {
    setHolding(false);
    longPress.onPointerUp();
  };
  const gap = spaced ? "mt-[22px]" : undefined;
  const line = mark ? `${mark} / ${value}` : value;

  return (
    <>
      <span className={cn("compass-type-zone whitespace-nowrap", gap)}>{lead}</span>
      <div data-fill-row={item.id} className={cn("flex min-w-0 items-baseline gap-2", gap)}>
        {deleteReady ? (
          <button
            type="button"
            data-delete-marker
            aria-label="Delete item"
            onClick={onDelete}
            className="shrink-0 text-foreground"
          >
            <X className="size-3.5" strokeWidth={1.5} aria-hidden />
          </button>
        ) : null}
        <button
          type="button"
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
            onEdit();
          }}
          onContextMenu={longPress.onContextMenu}
          className={cn(
            "compass-type-value min-w-0 overflow-hidden whitespace-nowrap text-left",
            holding && "opacity-40",
            onCard ? "text-foreground" : "text-label",
          )}
        >
          {item.type === "photo" && item.url.startsWith("data:") ? (
            <img src={item.url} alt="" className="mr-2 inline-block size-8 rounded-[10px] object-cover align-middle" />
          ) : null}
          {line}
        </button>
      </div>
      <div className={cn("relative z-10 flex items-center justify-center overflow-x-clip", gap)}>
        <CardToggleButton
          onCard={onCard}
          onAdd={onAdd}
          onRemove={onRemove}
          itemId={item.id}
          listId={cardId}
          flyLabel={value}
        />
      </div>
    </>
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
  const listScrollRef = useRef<HTMLDivElement>(null);
  const [listScrollFade, setListScrollFade] = useState({ top: false, bottom: false });
  const { keyboardOpen } = useVisualViewport();

  const syncListScrollFade = useCallback(() => {
    const el = listScrollRef.current;
    if (!el) return;

    const maxScroll = el.scrollHeight - el.clientHeight;
    const next = {
      top: el.scrollTop > 2,
      bottom: maxScroll > 1 && el.scrollTop < maxScroll - 1,
    };
    setListScrollFade((current) =>
      current.top === next.top && current.bottom === next.bottom ? current : next,
    );
  }, []);

  const rows = useMemo(
    () => sortContactList(contactItems, card.contactItemIds),
    [contactItems, card.contactItemIds],
  );
  const filledRows = useMemo(() => rows.filter((item) => isContactFilled(item)), [rows]);
  const zones = useMemo(() => groupLibrary(filledRows), [filledRows]);
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
        className="compass-library-list mx-auto flex min-h-0 flex-col overflow-hidden px-2.5"
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
              <div
                ref={listScrollRef}
                onScroll={syncListScrollFade}
                className="compass-library-list-scroll grid h-full min-h-0 auto-rows-min grid-cols-[70px_minmax(0,1fr)_22px] items-baseline gap-x-1.5 gap-y-[7px] pt-[22px]"
              >
                {zones.map((zone, zoneIndex) =>
                  zone.rows.map((row, rowIndex) => {
                    const entry = row.item;
                    if (!entry) return null;
                    return (
                      <FilledRow
                        key={entry.id}
                        lead={rowIndex === 0 ? zone.title : ""}
                        spaced={zoneIndex > 0 && rowIndex === 0}
                        mark={row.axis}
                        value={row.value}
                        item={entry}
                        onCard={isItemOnCard(card, entry.id)}
                        onEdit={() => openComposer(entry.id)}
                        onAdd={() => addItemToCard(card.id, entry.id)}
                        onRemove={() => removeItemFromCard(card.id, entry.id)}
                        cardId={card.id}
                        deleteReady={deleteReadyId === entry.id}
                        onArmDelete={() => setDeleteReadyId(entry.id)}
                        onDelete={() => {
                          setDeleteReadyId(null);
                          deleteContactItem(entry.id);
                        }}
                      />
                    );
                  }),
                )}
              </div>
              {listScrollFade.top ? (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-sheet to-transparent"
                  style={{ height: 56 }}
                />
              ) : null}
              {listScrollFade.bottom ? (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-b from-transparent to-sheet"
                  style={{ height: 40 }}
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
                "compass-icon-circle size-[18px] shrink-0 transition-opacity active:opacity-60",
                filledRows.length > 0 && "mt-2",
              )}
            >
              <Plus className="size-2.5 text-label" strokeWidth={FILL_ICON_STROKE} aria-hidden />
            </button>
          </div>
        </div>
        ) : null}
      </div>
      )}
    </div>
  );
}
