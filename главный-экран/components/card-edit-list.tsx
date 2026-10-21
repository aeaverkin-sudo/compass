"use client";

import { File as FileIcon, Plus, X } from "lucide-react";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type ReactNode, type RefObject } from "react";
import { createPortal, flushSync } from "react-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { SectionNumber, ValueCap, sectionNumberLabel } from "@/shared/components/section-number";
import { useLongPress } from "@/shared/hooks/use-long-press";
import { DELETE_HOLD_MS, REORDER_SLOP_PX } from "@/shared/lib/reorder-hold";
import { tick } from "@/shared/lib/haptic";
import { flashRow } from "@/shared/lib/row-flash";
import {
  groupEditSections,
  isExtraZoneId,
  isProseValue,
  ZONE_HINTS,
  type CardDisplayRow,
  type CardZoneId,
} from "@/shared/services/card-zones";
import {
  detectContactType,
  findIdenticalItem,
  isContactFilled,
  messengerCountryHint,
} from "@/shared/services/contact-item";
import { WrapField, type WrapFieldHandle } from "./wrap-field";
import { customDisplayName } from "@/shared/services/link-display";
import { SkyHint } from "@/shared/components/sky-hint";
import { SkyToast } from "@/shared/components/sky-toast";
import { useAppStore } from "@/shared/store/app-store";
import { fileStatusLine, useUploadStatus } from "@/shared/store/upload-status";
import { isAttachmentType } from "@/shared/services/portfolio-limits";
import type { Card, ContactItem } from "@/shared/types";
import { itemPhotoSrc } from "@/shared/services/card-photo";
import { useFinePointer, useKeyboardDock } from "@main/hooks/use-keyboard-dock";
import { openContactAttachmentPicker } from "@landing/components/photo-input-utils";

const OFF_CARD = "var(--placeholder)";
const DELETE_RED = "#E23B2F";
const ADD_PLACEHOLDER = "Add link, file, text, contact…";
const NEW_ZONE_TITLE = "TITLE";
const LOOKING_FOR = "Looking for";
/** An event pass keeps Event on About, so Looking for takes a section the pass never fills. */
const LOOKING_FOR_ZONE = "background";
const BLUR_GUARD_MS = 300;
const OPEN_GUARD_MS = 450;
const KEYBOARD_MIN_PX = 80;
const DUPLICATE_NOTICE = "Already in your library";

/** A docked line grows with its text up to the screen above the keyboard; only past that it scrolls. */
function dockReach(keyboard: number) {
  return `calc(100dvh - ${keyboard}px - 56px)`;
}

function isLiftField(node: EventTarget | null): node is HTMLElement {
  if (!(node instanceof HTMLElement)) return false;
  return node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node.isContentEditable;
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

/** A finished link. Enter closes it. About and other free text keep the line break. */
function enterFinishes(value: string, zoneId?: CardZoneId | null) {
  const line = value.trim();
  if (!line || zoneId === "about" || isProseValue(line)) return false;
  if (detectContactType(line) !== "text") return true;
  return Boolean(zoneId);
}

function buildSections(card: Card, items: ContactItem[], cards: Card[]): EditSection[] {
  const onCard = new Set(card.contactItemIds);
  const order = new Map(card.contactItemIds.map((id, index) => [id, index]));
  const grouped = groupEditSections(items.filter(isContactFilled), card, cards);

  return grouped.map((zone) => {
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
}

function LibraryCheck({ onCard, onToggle }: { onCard: boolean; onToggle: () => void }) {
  const origin = useRef<{ x: number; y: number } | null>(null);
  const viaPointer = useRef(false);
  return (
    <Checkbox
      variant="library"
      checked={onCard}
      data-no-swipe
      aria-label={onCard ? "Remove from portfolio" : "Add to portfolio"}
      className="relative z-10 -mr-[11px] -mt-[11px]"
      onPointerDown={(event) => {
        viaPointer.current = false;
        origin.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
        const start = origin.current;
        origin.current = null;
        if (event.pointerType === "mouse" && event.button !== 0) return;
        if (start) {
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          if (dx * dx + dy * dy > REORDER_SLOP_PX * REORDER_SLOP_PX) return;
        }
        viaPointer.current = true;
        onToggle();
      }}
      onPointerCancel={() => {
        origin.current = null;
        viaPointer.current = false;
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (viaPointer.current) {
          viaPointer.current = false;
          return;
        }
        if (event.detail === 0) onToggle();
      }}
      onCheckedChange={() => undefined}
    />
  );
}

function unusedExtraId(card: Card, keepId?: string) {
  for (const id of card.rubricOrder ?? []) {
    if (!isExtraZoneId(id) || id === keepId) continue;
    if (card.rubricLabels?.[id]?.trim()) continue;
    if (Object.values(card.itemZones ?? {}).some((zone) => zone === id)) continue;
    return id;
  }
  return null;
}

function FileAddButton({
  onClick,
  onPointerDown,
}: {
  onClick: () => void;
  onPointerDown?: () => void;
}) {
  return (
    <button
      type="button"
      data-no-swipe
      aria-label="Add photo or file"
      onMouseDown={(event) => event.preventDefault()}
      onPointerDown={onPointerDown}
      onClick={onClick}
      className="flex h-[24.6px] w-7 shrink-0 items-center justify-center text-[#111]"
    >
      <Plus className="size-7 text-[#111]" strokeWidth={1} aria-hidden />
    </button>
  );
}

function HeadingCompose({
  field,
  lined = false,
}: {
  field: ReactNode;
  lined?: boolean;
}) {
  if (!lined) return field;
  return <div className="flex flex-col justify-end border-b border-[var(--rule)]">{field}</div>;
}

function SectionLabel({
  title,
  included,
  editing,
  hideReady,
  pill,
  seed,
  onEdit,
  onCommit,
  onAdvance,
  onStay,
  advancing,
  onArmHide,
  onHide,
}: {
  title: string;
  included: boolean;
  editing: boolean;
  hideReady: boolean;
  /** New extra shelf: the label slot shows TITLE until a name is typed. */
  pill?: boolean;
  /** Parent docks the whole new zone; this heading stays in that block. */
  seed?: boolean;
  onEdit: () => void;
  onCommit: (next: string) => void;
  /** Enter on a new zone title moves the caret to the value line. */
  onAdvance?: (next: string) => void;
  onStay?: (event: FocusEvent<HTMLDivElement>) => boolean;
  /** Set when Enter or the value row asked to leave the title, so a fast blur still commits. */
  advancing?: RefObject<boolean>;
  onArmHide: () => void;
  onHide: () => void;
}) {
  const dockRef = useRef<WrapFieldHandle>(null);
  const desktop = useFinePointer();
  const openedAt = useRef(0);
  const pressedLong = useRef(false);
  const longPress = useLongPress(() => {
    pressedLong.current = true;
    tick();
    onArmHide();
  }, DELETE_HOLD_MS);
  const shown = title.trim() || (pill ? NEW_ZONE_TITLE : title);

  const begin = () => {
    openedAt.current = Date.now();
    flushSync(() => {
      onEdit();
    });
  };

  const finish = (next: string) => {
    if (!desktop && Date.now() - openedAt.current < 700) {
      dockRef.current?.focusEnd();
      return;
    }
    onCommit(next);
  };

  useLayoutEffect(() => {
    if (!editing) return;
    openedAt.current = Date.now();
    dockRef.current?.focusEnd();
  }, [editing]);

  const field = (
    <WrapField
      ref={dockRef}
      initial={title}
      label="Section name"
      placeholder={pill ? NEW_ZONE_TITLE : undefined}
      placeholderClassName="t-label text-[var(--placeholder)]"
      autoFocus={pill}
      onEmptyDelete={pill ? () => onCommit("") : undefined}
      onDone={(next) => {
        if (seed && onAdvance) {
          onAdvance(next);
          return;
        }
        onCommit(next);
      }}
      onBlur={(next, event) => {
        if (onStay?.(event) || advancing?.current) {
          onCommit(next);
          return;
        }
        finish(next);
      }}
      className={cn(
        "bg-transparent t-label caret-[var(--ink)]",
        pill || (included && title.trim()) ? "text-[var(--grey)]" : "text-[var(--placeholder)]",
      )}
    />
  );

  return (
    <>
      <div className="relative min-w-0">
        {editing ? (
          <HeadingCompose field={field} />
        ) : (
          <button
            type="button"
            data-no-swipe
            className={cn(
              "t-label block w-full whitespace-normal line-clamp-3 bg-transparent text-left",
              hideReady && "opacity-40",
            )}
            style={{ color: included && title.trim() ? "var(--grey)" : OFF_CARD }}
            onPointerDown={(event) => {
              if (editing || hideReady) return;
              pressedLong.current = false;
              longPress.onPointerDown(event);
            }}
            onPointerMove={longPress.onPointerMove}
            onPointerUp={() => {
              longPress.onPointerUp();
              if (editing || pressedLong.current || hideReady) return;
              begin();
            }}
            onPointerCancel={longPress.onPointerUp}
            onContextMenu={longPress.onContextMenu}
          >
            {shown}
          </button>
        )}
        {hideReady && !(editing && pill) ? (
          <button
            type="button"
            data-delete-marker
            aria-label="Hide section"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onHide}
            className="absolute -right-2 top-0 z-10 -m-2.5 flex size-10 items-center justify-center"
          >
            <X className="pointer-events-none size-4" strokeWidth={1.5} style={{ color: DELETE_RED }} aria-hidden />
          </button>
        ) : null}
      </div>
    </>
  );
}

export const CardEditList = memo(function CardEditList({
  card: cardProp,
  items: _items,
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
  const card = useAppStore((state) => state.cards.find((entry) => entry.id === cardProp.id) ?? cardProp);
  const items = useAppStore((state) => state.contactItems);
  void _items;
  const updateCard = useAppStore((state) => state.updateCard);
  const updateContactItem = useAppStore((state) => state.updateContactItem);
  const addItemToCard = useAppStore((state) => state.addItemToCard);
  const removeItemFromCard = useAppStore((state) => state.removeItemFromCard);
  const updateContactItemAttachment = useAppStore((state) => state.updateContactItemAttachment);
  const setRubricLabel = useAppStore((state) => state.setRubricLabel);
  const addCustomZone = useAppStore((state) => state.addCustomZone);
  const hideZone = useAppStore((state) => state.hideZone);
  const addContactItem = useAppStore((state) => state.addContactItem);
  const deleteContactItem = useAppStore((state) => state.deleteContactItem);
  const openNewZoneRef = useRef<() => void>(() => {});
  const [textEditId, setTextEditId] = useState<string | null>(null);
  const [sectionEditId, setSectionEditId] = useState<string | null>(null);
  const [seedZoneId, setSeedZoneId] = useState<string | null>(null);
  const advanceSeedRef = useRef(false);
  const [deleteReadyId, setDeleteReadyId] = useState<string | null>(null);
  const [hideReadyId, setHideReadyId] = useState<string | null>(null);
  const openZoneRef = useRef<((zone: CardZoneId) => void) | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [libraryHint, setLibraryHint] = useState<"add" | "first" | null>(null);
  const [duplicateNotice, setDuplicateNotice] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const extraBlockRef = useRef<HTMLDivElement>(null);
  const extraValueRef = useRef<WrapFieldHandle>(null);
  const keepExtraRef = useRef(false);

  const refuseDuplicate = useCallback((twinId: string) => {
    tick();
    flashRow(listRef.current?.querySelector<HTMLElement>(`[data-item-row="${CSS.escape(twinId)}"]`));
    setDuplicateNotice((count) => count + 1);
  }, []);

  useEffect(() => () => onComposingChange?.(false), [onComposingChange]);

  useEffect(() => {
    const cardId = card.id;
    return () => {
      const live = useAppStore.getState().cards.find((entry) => entry.id === cardId);
      if (!live) return;
      const hide = useAppStore.getState().hideZone;
      let leftover = unusedExtraId(live);
      while (leftover) {
        hide(cardId, leftover);
        const next = useAppStore.getState().cards.find((entry) => entry.id === cardId);
        leftover = next ? unusedExtraId(next) : null;
      }
    };
  }, [card.id]);

  useEffect(() => {
    if (!openAddRef) return;
    const openNewZone = () => {
      const live = useAppStore.getState().cards.find((entry) => entry.id === card.id);
      const existing = live ? unusedExtraId(live) : null;
      if (existing && live) {
        let leftover = unusedExtraId(live, existing);
        while (leftover) {
          hideZone(card.id, leftover);
          const next = useAppStore.getState().cards.find((entry) => entry.id === card.id);
          leftover = next ? unusedExtraId(next, existing) : null;
        }
      }
      const id = existing ?? addCustomZone(card.id);
      if (!id) return;
      flushSync(() => {
        setTextEditId(null);
        setDeleteReadyId(null);
        setHideReadyId(null);
        setSeedZoneId(id);
        setSectionEditId(id);
      });
      const section = listRef.current?.querySelector<HTMLElement>(`[data-zone="${CSS.escape(id)}"]`);
      const scroller = listRef.current?.closest<HTMLElement>(".compass-card-scroll");
      if (section && scroller) {
        const top = section.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
        scroller.scrollTop += top;
      }
      section?.querySelector<HTMLElement>("[contenteditable]")?.focus({ preventScroll: true });
    };
    openNewZoneRef.current = openNewZone;
    openAddRef.current = openNewZone;
    return () => {
      openAddRef.current = null;
    };
  });

  useEffect(() => {
    const list = listRef.current;
    const scroller = list?.closest<HTMLElement>(".compass-card-scroll");
    if (!list || !scroller) return;
    const viewport = window.visualViewport;
    let baseline = viewport?.height ?? window.innerHeight;
    let timer = 0;
    let pinning = false;
    let seenShift = 0;
    const inset = () => {
      const next = window.visualViewport;
      if (!next) return 0;
      return Math.max(0, Math.round(baseline - next.height));
    };
    const place = (lift: boolean) => {
      if (pinning) return;
      const next = window.visualViewport;
      const field = document.activeElement;
      const mine = isLiftField(field) && list.contains(field);
      const shift = next?.offsetTop ?? 0;
      if (shift > 1 || window.scrollY > 0) {
        const delta = shift - seenShift;
        seenShift = shift;
        pinning = true;
        window.scrollTo(0, 0);
        if (mine && delta > 1) scroller.scrollTop += delta;
        pinning = false;
      } else {
        seenShift = 0;
      }
      const height = inset();
      if (!mine || height < KEYBOARD_MIN_PX) {
        if (next && height < KEYBOARD_MIN_PX) baseline = next.height;
        scroller.style.paddingBottom = "";
        return;
      }
      scroller.style.paddingBottom = `${height}px`;
      if (!lift || !next) return;
      const covered = field.getBoundingClientRect().bottom - (next.height - 8);
      if (covered > 2) scroller.scrollTop += covered;
    };
    const onFocus = (event: globalThis.FocusEvent) => {
      if (!isLiftField(event.target) || !list.contains(event.target)) return;
      const next = window.visualViewport;
      if (next && inset() < KEYBOARD_MIN_PX) baseline = next.height;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => place(true), 300);
    };
    scroller.addEventListener("focusin", onFocus);
    const onResize = () => place(true);
    const onViewportScroll = () => place(false);
    viewport?.addEventListener("resize", onResize);
    viewport?.addEventListener("scroll", onViewportScroll);
    return () => {
      scroller.removeEventListener("focusin", onFocus);
      viewport?.removeEventListener("resize", onResize);
      viewport?.removeEventListener("scroll", onViewportScroll);
      window.clearTimeout(timer);
      scroller.style.paddingBottom = "";
    };
  }, []);

  useEffect(() => {
    if (composeOnMount) openNewZoneRef.current();
  }, [composeOnMount]);

  const sections = useMemo(
    () => buildSections(card, items, useAppStore.getState().cards),
    [card, items],
  );
  const seeding = Boolean(seedZoneId);

  useLayoutEffect(() => {
    if (!seeding) return;
    extraBlockRef.current?.querySelector<HTMLElement>("[contenteditable]")?.focus({ preventScroll: true });
  }, [seeding]);

  useEffect(() => {
    if (!deleteReadyId && !hideReadyId) return;
    const dismiss = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-delete-marker], [data-delete-confirm]")) return;
      setDeleteReadyId(null);
      setHideReadyId(null);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [deleteReadyId, hideReadyId]);

  const include = useCallback(
    (itemId: string, zoneId?: CardZoneId) => {
      addItemToCard(card.id, itemId, zoneId);
    },
    [addItemToCard, card.id],
  );

  const toggleOnCard = useCallback(
    (itemId: string, zoneId: CardZoneId) => {
      tick();
      const on = useAppStore.getState().cards.find((entry) => entry.id === card.id)?.contactItemIds.includes(itemId);
      if (on) removeItemFromCard(card.id, itemId);
      else include(itemId, zoneId);
    },
    [card.id, include, removeItemFromCard],
  );

  const startRowEdit = useCallback((itemId: string) => {
    setDeleteReadyId(null);
    setHideReadyId(null);
    setSectionEditId(null);
    setTextEditId(itemId);
  }, []);

  const saveRowText = useCallback((item: ContactItem, shown: string, next: string) => {
    const trimmed = next.trim();
    if (!trimmed || trimmed === shown) return;
    const stored =
      customDisplayName(item) ||
      (shown !== item.value.trim() &&
        item.type !== "text" &&
        item.type !== "position" &&
        item.type !== "email" &&
        item.type !== "phone");
    if (!stored) {
      const twin = findIdenticalItem(useAppStore.getState().contactItems, trimmed, item.id);
      if (twin) {
        refuseDuplicate(twin.id);
        return;
      }
    }
    updateContactItem(item.id, stored ? { label: trimmed } : { value: trimmed });
    if (card.headerItemId === item.id) updateCard(card.id, { title: trimmed });
  }, [card.headerItemId, card.id, refuseDuplicate, updateCard, updateContactItem]);

  const confirmRow = useCallback(
    (itemId: string, shown: string, next: string) => {
      const item = useAppStore.getState().contactItems.find((row) => row.id === itemId);
      if (!item) return;
      saveRowText(item, shown, next);
      setTextEditId(null);
    },
    [saveRowText],
  );

  const eraseRow = useCallback(
    (itemId: string) => {
      if (card.headerItemId === itemId) updateCard(card.id, { headerItemId: undefined, title: "" });
      setTextEditId(null);
      setDeleteReadyId(null);
      deleteContactItem(itemId);
    },
    [card.headerItemId, card.id, deleteContactItem, updateCard],
  );

  const askDelete = useCallback((itemId: string) => {
    setConfirmDelete(itemId);
  }, []);

  const retryFile = useCallback(
    (itemId: string) => {
      openContactAttachmentPicker((dataUrl, file) => {
        const result = updateContactItemAttachment(card.id, itemId, file, dataUrl);
        if (!result.ok) useUploadStatus.getState().fail(itemId, result.message);
      });
    },
    [card.id, updateContactItemAttachment],
  );

  const endSeed = (zoneId?: string) => {
    setSeedZoneId((current) => (zoneId && current !== zoneId ? current : null));
    setSectionEditId((current) => (zoneId && current !== zoneId ? current : null));
  };

  const seedItem = (zoneId: string, raw: string) => {
    const value = raw.trim();
    if (!value) {
      endSeed(zoneId);
      return;
    }
    const twin = findIdenticalItem(useAppStore.getState().contactItems, value);
    if (twin) {
      refuseDuplicate(twin.id);
      return;
    }
    const id = addContactItem();
    if (!id) {
      endSeed(zoneId);
      return;
    }
    updateContactItem(id, { value });
    const item = useAppStore.getState().contactItems.find((row) => row.id === id);
    if (!item || !isContactFilled(item)) {
      deleteContactItem(id);
      endSeed(zoneId);
      return;
    }
    addItemToCard(card.id, id, zoneId);
    endSeed(zoneId);
  };

  const addSeedFile = (zoneId: string) => {
    openContactAttachmentPicker((dataUrl, file) => {
      const id = addContactItem();
      if (!id) return;
      const result = updateContactItemAttachment(card.id, id, file, dataUrl);
      if (!result.ok) {
        deleteContactItem(id);
        useUploadStatus.getState().fail(id, result.message);
        return;
      }
      addItemToCard(card.id, id, zoneId);
      endSeed(zoneId);
    });
  };

  const stayInSeed = (event: FocusEvent<HTMLDivElement>) =>
    Boolean(extraBlockRef.current?.contains(event.relatedTarget as Node | null));

  return (
    <div ref={listRef} data-card-chip-list={card.id} data-card-content>
      {sections.map((section, index) => {
        const seedingThis = seedZoneId === section.id;
        const zoneHint = isExtraZoneId(section.id) ? "Contacts, location, etc." : (ZONE_HINTS[section.id] ?? "");
        const files = section.id === "files" || isExtraZoneId(section.id);
        const startSeed = () => {
          setTextEditId(null);
          setSectionEditId(null);
          setDeleteReadyId(null);
          setHideReadyId(null);
          setSeedZoneId(section.id);
        };
        return (
          <section
            key={section.id}
            data-zone={section.id}
            className={cn("min-w-0 py-[18px]", index < sections.length - 1 && "border-b border-[var(--rule)]")}
          >
            <div
              ref={seedingThis ? extraBlockRef : undefined}
              className="grid grid-cols-[86px_minmax(0,1fr)] items-start gap-x-[14px]"
            >
              <div className="min-w-0">
                <SectionNumber value={sectionNumberLabel(index)} />
                <div className="mt-[6px]">
                  <SectionLabel
                    title={section.title}
                    included={section.included}
                    editing={sectionEditId === section.id}
                    hideReady={hideReadyId === section.id}
                    pill={isExtraZoneId(section.id)}
                    seed={seedingThis}
                    onStay={seedingThis ? stayInSeed : undefined}
                    advancing={seedingThis ? advanceSeedRef : undefined}
                    onAdvance={(next) => {
                      advanceSeedRef.current = true;
                      const name = next.trim();
                      if (name) setRubricLabel(card.id, section.id, name);
                      extraValueRef.current?.focusEnd();
                      setSectionEditId(null);
                    }}
                    onEdit={() => {
                      setTextEditId(null);
                      setDeleteReadyId(null);
                      setHideReadyId(null);
                      setSectionEditId(section.id);
                      if (isExtraZoneId(section.id) && !section.title.trim() && section.rows.length === 0) {
                        setSeedZoneId(section.id);
                      }
                    }}
                    onCommit={(next) => {
                      const name = next.trim();
                      if (advanceSeedRef.current) {
                        advanceSeedRef.current = false;
                        keepExtraRef.current = false;
                        if (name) setRubricLabel(card.id, section.id, next);
                        extraValueRef.current?.focusEnd();
                        setSectionEditId(null);
                        return;
                      }
                      if (isExtraZoneId(section.id) && !name) {
                        if (keepExtraRef.current) {
                          keepExtraRef.current = false;
                          return;
                        }
                        if (extraValueRef.current?.text().trim()) return;
                        const valueEl = extraValueRef.current?.element();
                        if (seedZoneId === section.id && valueEl?.contains(document.activeElement)) {
                          setSectionEditId(null);
                          return;
                        }
                        endSeed(section.id);
                        if (section.rows.length === 0) hideZone(card.id, section.id);
                        return;
                      }
                      keepExtraRef.current = false;
                      setRubricLabel(card.id, section.id, next);
                      if (seedZoneId === section.id) {
                        extraValueRef.current?.focusEnd();
                        setSectionEditId(null);
                        return;
                      }
                      setSectionEditId(null);
                    }}
                    onArmHide={() => {
                      setTextEditId(null);
                      setSeedZoneId(null);
                      setSectionEditId(null);
                      setDeleteReadyId(null);
                      setHideReadyId(section.id);
                    }}
                    onHide={() => {
                      hideZone(card.id, section.id);
                      endSeed(section.id);
                      setHideReadyId(null);
                    }}
                  />
                </div>
              </div>
              <ValueCap className="flex min-w-0 flex-col gap-[6px]">
                {section.rows.map(({ row, onCard }) => {
                  const item = row.item;
                  if (!item) return null;
                  return (
                    <EditRow
                      key={item.id}
                      itemId={item.id}
                      zoneId={section.id}
                      text={lineOf(row)}
                      value={row.value}
                      multiline={
                        section.id === "about" ||
                        item.value.includes("\n") ||
                        isProseValue(item.value)
                      }
                      onCard={onCard}
                      editing={textEditId === item.id}
                      deleteReady={deleteReadyId === item.id}
                      onArmDelete={setDeleteReadyId}
                      onDelete={askDelete}
                      onToggle={toggleOnCard}
                      onEdit={startRowEdit}
                      onConfirm={confirmRow}
                      onErase={eraseRow}
                      fileUrl={isAttachmentType(item.type) ? row.url : undefined}
                      onRetryFile={retryFile}
                    />
                  );
                })}
                {seedingThis ? (
                  <div className="flex min-w-0 items-start gap-[11px]">
                    {files ? (
                      <FileAddButton
                        onPointerDown={() => {
                          advanceSeedRef.current = true;
                        }}
                        onClick={() => addSeedFile(section.id)}
                      />
                    ) : null}
                    <WrapField
                      ref={extraValueRef}
                      label={section.rows.length === 0 ? zoneHint : "Value"}
                      placeholder={section.rows.length === 0 ? zoneHint : ""}
                      placeholderClassName="t-body text-[var(--placeholder)]"
                      autoFocus={!isExtraZoneId(section.id) || Boolean(section.title.trim())}
                      onPointerDown={() => {
                        advanceSeedRef.current = true;
                      }}
                      onDone={(next) => seedItem(section.id, next)}
                      onEmptyDelete={() => {
                        if (extraValueRef.current?.text().trim()) return;
                        if (isExtraZoneId(section.id) && !section.title.trim() && section.rows.length === 0) {
                          hideZone(card.id, section.id);
                        }
                        endSeed(section.id);
                      }}
                      onBlur={(next, event) => {
                        if (stayInSeed(event)) return;
                        if (!next.trim()) {
                          if (!section.title.trim()) hideZone(card.id, section.id);
                          endSeed(section.id);
                          return;
                        }
                        seedItem(section.id, next);
                      }}
                      className="bg-transparent t-body text-[var(--ink)] caret-[var(--ink)]"
                    />
                    <div className="pointer-events-none">
                      <LibraryCheck onCard={false} onToggle={() => undefined} />
                    </div>
                  </div>
                ) : section.rows.length === 0 ? (
                  <button
                    type="button"
                    data-no-swipe
                    className="t-body w-full bg-transparent text-left"
                    style={{ color: OFF_CARD }}
                    onClick={startSeed}
                  >
                    {zoneHint}
                  </button>
                ) : (
                  <button
                    type="button"
                    data-no-swipe
                    data-zone-add=""
                    aria-label="Add to section"
                    className="t-body w-full border-0 bg-transparent p-0 text-left text-[var(--placeholder)]"
                    onClick={startSeed}
                  >
                    +
                  </button>
                )}
              </ValueCap>
            </div>
          </section>
        );
      })}
      <AddLine
        cardId={card.id}
        openOnMount={false}
        openZoneRef={openZoneRef}
        onFocus={() => setTextEditId(null)}
        onDuplicate={refuseDuplicate}
        onOpenChange={(open) => {
          onComposingChange?.(open);
          if (open && !useAppStore.getState().user.addLibraryHintSeen) setLibraryHint("add");
        }}
        onAdded={() => {
          const user = useAppStore.getState().user;
          if (user.firstRowHintSeen) return;
          if (!user.addLibraryHintSeen) useAppStore.getState().markAddLibraryHintSeen();
          setLibraryHint("first");
        }}
      />
      {duplicateNotice > 0 ? (
        <SkyToast key={duplicateNotice} text={DUPLICATE_NOTICE} onDone={() => setDuplicateNotice(0)} />
      ) : null}
      {libraryHint === "add" ? (
        <SkyHint
          text="Add anything to the library and use it in different portfolios"
          onDone={() => {
            useAppStore.getState().markAddLibraryHintSeen();
            setLibraryHint(null);
          }}
        />
      ) : null}
      {libraryHint === "first" ? (
        <SkyHint
          text="Tap + to use in the portfolio"
          onDone={() => {
            useAppStore.getState().markFirstRowHintSeen();
            setLibraryHint(null);
          }}
        />
      ) : null}
      <Dialog.Root
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmDelete(null);
            setDeleteReadyId(null);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-transparent" />
          <Dialog.Content
            data-delete-confirm=""
            className="fixed top-1/2 left-1/2 z-50 w-max max-w-[min(100%-48px,280px)] -translate-x-1/2 -translate-y-1/2 bg-sky px-5 py-4 text-center outline-none"
          >
            <Dialog.Title className="t-body text-[var(--ink)]">
              Delete from library
            </Dialog.Title>
            <Dialog.Description className="sr-only">This removes the row from the library.</Dialog.Description>
            <div className="mt-3 flex justify-center gap-6">
              <button
                type="button"
                className="t-body text-[var(--ink)]"
                onClick={() => {
                  const id = confirmDelete;
                  setConfirmDelete(null);
                  setDeleteReadyId(null);
                  if (id) deleteContactItem(id);
                }}
              >
                Yes
              </button>
              <button type="button" className="t-body text-[var(--grey)]" onClick={() => {
                setConfirmDelete(null);
                setDeleteReadyId(null);
              }}>
                No
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
});

/** Sky plaque at the very bottom. The first portfolio resets to photo and name; any other is deleted. */
/**
 * A zone's + docks one writing line above the keyboard. Text stays here until Done,
 * so nothing half-typed reaches the card. A picked file joins the same line.
 */
function AddLine({
  cardId,
  openOnMount,
  openZoneRef,
  onFocus,
  onDuplicate,
  onOpenChange,
  onAdded,
}: {
  cardId: string;
  openOnMount: boolean;
  /** A zone's +. The new row is pinned to that shelf. */
  openZoneRef?: RefObject<((zone: CardZoneId) => void) | null>;
  onFocus: () => void;
  /** The typed line is already a library row. The line stays open with its text. */
  onDuplicate: (twinId: string) => void;
  onOpenChange: (open: boolean) => void;
  onAdded: (itemId: string) => void;
}) {
  const addContactItem = useAppStore((state) => state.addContactItem);
  const addItemToCard = useAppStore((state) => state.addItemToCard);
  const updateContactItem = useAppStore((state) => state.updateContactItem);
  const updateContactItemAttachment = useAppStore((state) => state.updateContactItemAttachment);
  const deleteContactItem = useAppStore((state) => state.deleteContactItem);

  const [open, setOpen] = useState(false);
  const [pinZone, setPinZone] = useState<CardZoneId | null>(null);
  const pinZoneRef = useRef<CardZoneId | null>(null);
  const [frame, setFrame] = useState({ left: 0, width: 0 });
  const [text, setText] = useState("");
  const [fileItemId, setFileItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [lookingFor, setLookingFor] = useState(false);
  const passCard = useAppStore((state) => {
    const labels = state.cards.find((card) => card.id === cardId)?.rubricLabels;
    return labels?.about === "Event" || labels?.additional === "Event";
  });
  const fileItem = useAppStore((state) =>
    fileItemId ? state.contactItems.find((item) => item.id === fileItemId) : undefined,
  );
  const anchorRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<WrapFieldHandle>(null);
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

  const beginCompose = (zone?: CardZoneId) => {
    pinZoneRef.current = zone ?? null;
    setPinZone(zone ?? null);
    flushSync(startDocking);
    fieldRef.current?.focusEnd();
  };

  useEffect(() => {
    if (!openZoneRef) return;
    openZoneRef.current = (zone) => beginCompose(zone);
    return () => {
      openZoneRef.current = null;
    };
  });

  // The empty card asks for the line once, as it opens.
  useLayoutEffect(() => {
    if (openOnMount) startDocking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openOnMount]);

  // Layout phase: mounted from a tap, the focus still counts as the user's and raises the keyboard.
  useLayoutEffect(() => {
    if (open) fieldRef.current?.focusEnd();
  }, [open]);

  const dismissLine = () => {
    if (closedRef.current) return;
    closedRef.current = true;
    setLookingFor(false);
    setText("");
    setFileItemId(null);
    pinZoneRef.current = null;
    setPinZone(null);
    setOpen(false);
    onOpenChange(false);
  };

  /** A chosen file leaves the writing line. The card body shows it, and OK confirms the edit. */
  const placeOnCard = (itemId: string) => {
    addItemToCard(cardId, itemId, pinZoneRef.current ?? undefined);
    onAdded(itemId);
  };

  const placeFile = (itemId: string) => {
    const value = text.replace(/\s*\n\s*/g, " ").trim();
    if (value) updateContactItem(itemId, { label: value });
    placeOnCard(itemId);
    picking.current = false;
    dismissLine();
  };

  const commit = (raw?: string) => {
    const source = raw ?? text;
    const value = fileItemId ? source.replace(/\s*\n\s*/g, " ").trim() : source.trim();
    if (fileItemId) {
      if (value) updateContactItem(fileItemId, { label: value });
      placeOnCard(fileItemId);
      return true;
    }
    if (!value) return true;
    const twin = findIdenticalItem(useAppStore.getState().contactItems, value);
    if (twin) {
      onDuplicate(twin.id);
      return false;
    }
    const countryHint = messengerCountryHint(value);
    if (countryHint) {
      setHint(countryHint);
      return false;
    }
    const id = addContactItem();
    if (!id) return true;
    updateContactItem(id, { value });
    const item = useAppStore.getState().contactItems.find((row) => row.id === id);
    if (!item || !isContactFilled(item)) {
      deleteContactItem(id);
      return true;
    }
    placeOnCard(id);
    if (lookingFor) placeLookingFor(id);
    return true;
  };

  /** The pass's Looking for row is its own section, after the ones the card already has. */
  const placeLookingFor = (itemId: string) => {
    const state = useAppStore.getState();
    const card = state.cards.find((entry) => entry.id === cardId);
    state.setItemZone(cardId, itemId, LOOKING_FOR_ZONE);
    state.setRubricLabel(cardId, LOOKING_FOR_ZONE, LOOKING_FOR);
    const order = card?.rubricOrder ?? [];
    if (order.length > 0 && !order.includes(LOOKING_FOR_ZONE)) state.setCardRubricOrder(cardId, [...order, LOOKING_FOR_ZONE]);
  };

  const close = (raw?: string) => {
    if (closedRef.current) return;
    if (!commit(raw)) return;
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
      closeRef.current(fieldRef.current?.text());
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
  const handleBlur = (raw: string) => {
    window.setTimeout(() => {
      if (picking.current) return;
      if (Date.now() - openedAt.current < OPEN_GUARD_MS) return;
      if (lineRef.current?.contains(document.activeElement)) return;
      close(raw);
    }, BLUR_GUARD_MS);
  };

  const raiseKeyboard = () => {
    const field = fieldRef.current?.element();
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
    const field = fieldRef.current?.element();
    if (field && document.activeElement !== field) fieldRef.current?.focusEnd();
  };

  return (
    <>
      <div ref={anchorRef} className="h-0" aria-hidden />
      {open
        ? createPortal(
            <div
              ref={lineRef}
              data-no-swipe
              className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--rule)] bg-[#fff] pt-3"
              style={{ paddingBottom: dockBottom }}
            >
              <div
                ref={rowRef}
                className="overflow-y-auto overscroll-contain"
                style={{ marginLeft: frame.left, width: frame.width, maxHeight: dockReach(dockBottom) }}
              >
                {error ? <p className="pt-2 t-meta text-destructive">{error}</p> : null}
                {hint ? <p className="pt-2 t-meta text-[var(--ink)]">{hint}</p> : null}
                {passCard && !lookingFor && !fileItem && !text ? (
                  <button
                    type="button"
                    data-no-swipe
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setLookingFor(true);
                      fieldRef.current?.focusEnd();
                    }}
                    className="block border-0 bg-transparent p-0 pt-2 text-left t-meta text-[var(--grey)]"
                  >
                    {LOOKING_FOR}
                  </button>
                ) : null}
                <div className="flex items-start gap-[11px]">
                  {lookingFor ? (
                    <span className="shrink-0 pt-[3px] t-label">{LOOKING_FOR}</span>
                  ) : filePhoto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={filePhoto} alt="" className="size-10 shrink-0 object-cover" />
                  ) : fileItem ? (
                    <FileIcon className="size-7 shrink-0 text-[#111]" strokeWidth={1} aria-hidden />
                  ) : (
                    <FileAddButton onClick={takeAttachment} />
                  )}
                  <WrapField
                    ref={fieldRef}
                    label={ADD_PLACEHOLDER}
                    placeholder={fileItem ? fileItem.value : (pinZone && ZONE_HINTS[pinZone]) || ADD_PLACEHOLDER}
                    placeholderClassName="text-[16px] text-[var(--grey)]"
                    multiline={!fileItemId && !enterFinishes(text, pinZone)}
                    breakButton={false}
                    onTextChange={(next) => {
                      setText(next);
                      setError(null);
                      setHint(null);
                    }}
                    onDone={(next) => {
                      if (!commit(next)) return;
                      dismissLine();
                    }}
                    onEmptyDelete={() => {
                      const zone = pinZoneRef.current;
                      if (!zone || !isExtraZoneId(zone) || fileItemId) return;
                      const live = useAppStore.getState().cards.find((entry) => entry.id === cardId);
                      if (!live || live.rubricLabels?.[zone]?.trim()) return;
                      const used = Object.values(live.itemZones ?? {}).some((id) => id === zone);
                      if (used) return;
                      useAppStore.getState().hideZone(cardId, zone);
                      dismissLine();
                    }}
                    onFocus={onFocus}
                    onBlur={handleBlur}
                    onPointerDown={() => {
                      const vv = window.visualViewport;
                      if (!vv) return;
                      const overlap = window.innerHeight - vv.offsetTop - vv.height;
                      if (overlap > 120) return;
                      raiseKeyboard();
                    }}
                    className="min-w-0 flex-1 bg-transparent p-0 text-[16px] leading-normal text-[var(--ink)] caret-[var(--ink)]"
                  />
                  <div className="pointer-events-none">
                    <LibraryCheck onCard={false} onToggle={() => undefined} />
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

const EditRow = memo(function EditRow({
  itemId,
  zoneId,
  text,
  value,
  multiline,
  onCard,
  editing,
  deleteReady,
  onArmDelete,
  onDelete,
  onToggle,
  onEdit,
  onConfirm,
  onErase,
  fileUrl,
  onRetryFile,
}: {
  itemId: string;
  zoneId: CardZoneId;
  text: string;
  value: string;
  /** Additional text. Enter stays inside this one block. */
  multiline: boolean;
  onCard: boolean;
  editing: boolean;
  deleteReady: boolean;
  onArmDelete: (itemId: string) => void;
  onDelete: (itemId: string) => void;
  onToggle: (itemId: string, zoneId: CardZoneId) => void;
  onEdit: (itemId: string) => void;
  onConfirm: (itemId: string, shown: string, next: string) => void;
  onErase: (itemId: string) => void;
  /** Set on file rows: the row shows its upload state under the name. */
  fileUrl?: string;
  onRetryFile: (itemId: string) => void;
}) {
  const fileStatus = useUploadStatus((state) => state.byItem[itemId]);
  const statusLine = fileUrl === undefined ? null : fileStatusLine(fileStatus, fileUrl);
  const uploadFailed = statusLine !== null && fileStatus?.state !== "uploading";
  const rowRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<WrapFieldHandle>(null);
  const pressedLong = useRef(false);
  const openedAt = useRef(0);
  const [holding, setHolding] = useState(false);
  const [fades, setFades] = useState(false);
  const longPress = useLongPress(() => {
    pressedLong.current = true;
    setHolding(false);
    window.getSelection()?.removeAllRanges();
    tick();
    onArmDelete(itemId);
  }, DELETE_HOLD_MS);
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
      onEdit(itemId);
    });
  };

  useLayoutEffect(() => {
    if (!editing) return;
    dockRef.current?.focusEnd();
  }, [editing]);

  return (
    <div ref={rowRef} data-item-row={itemId} className="relative min-w-0">
      <div
        ref={fieldRef}
        aria-label={text}
        data-no-swipe
        className={cn(
          "mr-[26px] min-w-0 overflow-clip",
          (holding || deleteReady) && "opacity-40",
        )}
        style={{
          color: onCard ? "var(--ink)" : OFF_CARD,
        }}
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
          className={cn(
            "t-body origin-left",
            editing ? "whitespace-pre-wrap break-words" : "select-none",
            !editing && (multiline || isProseValue(value) || value.includes("\n") || value.includes("  "))
              ? "w-full whitespace-pre-wrap break-words"
              : !editing && "w-max whitespace-nowrap",
          )}
        >
          {editing ? (
            <WrapField
              ref={dockRef}
              initial={value}
              label="Edit row"
              multiline={multiline}
              onTextChange={(next) => {
                if (!next.trim()) onErase(itemId);
              }}
              breakButton={false}
              onDone={(next) => onConfirm(itemId, value, next)}
              onBlur={(next) => {
                if (!next.trim()) return;
                if (Date.now() - openedAt.current < 700) {
                  dockRef.current?.focusEnd();
                  return;
                }
                onConfirm(itemId, value, next);
              }}
              className="bg-transparent t-body text-[var(--ink)] caret-[var(--ink)]"
            />
          ) : (
            text
          )}
        </div>
      </div>
      {statusLine ? (
        uploadFailed ? (
          <button
            type="button"
            data-no-swipe
            onClick={() => onRetryFile(itemId)}
            className="mr-[26px] block text-left t-meta text-[var(--grey)]"
          >
            {statusLine}
          </button>
        ) : (
          <span className="mr-[26px] block t-meta text-[var(--grey)]">{statusLine}</span>
        )
      ) : null}
      {fades && !editing && !multiline && !isProseValue(value) && !value.includes("\n") ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-[26px] w-4 bg-gradient-to-r from-transparent to-white"
        />
      ) : null}
      <div className="absolute top-0 right-0 flex items-start">
        {deleteReady ? (
          <button
            type="button"
            data-delete-marker
            aria-label="Delete"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onDelete(itemId)}
            className="relative z-10 -m-2.5 flex size-10 items-center justify-center"
          >
            <X className="pointer-events-none size-4" strokeWidth={1.5} style={{ color: DELETE_RED }} aria-hidden />
          </button>
        ) : (
          <LibraryCheck onCard={onCard} onToggle={() => onToggle(itemId, zoneId)} />
        )}
      </div>
    </div>
  );
});
