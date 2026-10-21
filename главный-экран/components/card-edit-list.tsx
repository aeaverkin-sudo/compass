"use client";

import { Plus, X } from "lucide-react";
import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type ReactNode, type RefObject } from "react";
import { flushSync } from "react-dom";
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
  labelForNewZone,
  SOCIAL_HINT,
  FILES_HINT,
  zoneTitle,
  type CardDisplayRow,
  type CardZoneId,
} from "@/shared/services/card-zones";
import {
  detectContactType,
  findIdenticalItem,
  isContactFilled,
  messengerCountryHint,
} from "@/shared/services/contact-item";
import { typeLabel } from "@/shared/services/portfolio-catalog";
import { WrapField, type WrapFieldHandle } from "./wrap-field";
import { customDisplayName } from "@/shared/services/link-display";
import { SkyToast } from "@/shared/components/sky-toast";
import { useAppStore } from "@/shared/store/app-store";
import { fileStatusLine, useUploadStatus } from "@/shared/store/upload-status";
import { isAttachmentType } from "@/shared/services/portfolio-limits";
import type { Card, ContactItem } from "@/shared/types";
import { useFinePointer } from "@main/hooks/use-keyboard-dock";
import { openContactAttachmentPicker } from "@landing/components/photo-input-utils";
import { DELETE_RED } from "@/shared/layout/delete-red";

const OFF_CARD = "var(--placeholder)";
/** Row order for an open EDIT. Cleared when that list unmounts, so the next entry sorts again. */
const editRowOrder = new Map<string, Map<string, string[]>>();

function zonesOrder(cardId: string) {
  let zones = editRowOrder.get(cardId);
  if (!zones) {
    zones = new Map();
    editRowOrder.set(cardId, zones);
  }
  return zones;
}

function typedMark(value: string) {
  const kind = detectContactType(value);
  if (!value.trim() || kind === "text") return "";
  return `${typeLabel(kind)} / `;
}
const ADD_PLACEHOLDER = "Add link, file, text, contact…";
const NEW_SECTION_HINT = "Contacts, location, etc.";

function seedPlaceholder(section: { id: string; hint?: string }) {
  if (section.hint?.includes("@")) return undefined;
  if (section.hint) return section.hint;
  if (isExtraZoneId(section.id)) return NEW_SECTION_HINT;
  if (section.id === "social") return SOCIAL_HINT;
  if (section.id === "files") return FILES_HINT;
  return ADD_PLACEHOLDER;
}

function withNewSectionHint(section: EditSection): EditSection {
  if (section.rows.length > 0 || section.hint || !isExtraZoneId(section.id)) return section;
  return { ...section, hint: NEW_SECTION_HINT };
}
const NEW_ZONE_TITLE = "TITLE";
const LOOKING_FOR = "Looking for";
/** An event pass keeps Event on About, so Looking for takes a section the pass never fills. */
const LOOKING_FOR_ZONE = "background";
const DUPLICATE_NOTICE = "Already in your library";

type EditSection = {
  id: CardZoneId;
  title: string;
  included: boolean;
  rows: { row: CardDisplayRow; onCard: boolean }[];
  /** Empty starter row. The hint stands in for the plus until the zone has a line. */
  hint?: string;
  /** Questionnaire floor. A grey asterisk sits on the label. */
  required?: boolean;
};

export type ScaffoldZone = { id: CardZoneId; title: string; hint: string; required?: boolean };

function lineOf(row: CardDisplayRow) {
  return row.axis ? `${row.axis} / ${row.value}` : row.value;
}

/** The order captured at entry. Later checkbox toggles do not move a row. */
function freezeSection(section: EditSection, memory: Map<string, string[]>): EditSection {
  const prev = memory.get(section.id) ?? [];
  const byId = new Map(
    section.rows.flatMap(({ row, onCard }) => (row.item ? [[row.item.id, { row, onCard }] as const] : [])),
  );
  const next = prev.filter((id) => byId.has(id));
  for (const { row } of section.rows) {
    if (row.item && !next.includes(row.item.id)) next.push(row.item.id);
  }
  memory.set(section.id, next);
  return {
    ...section,
    rows: next.flatMap((id) => {
      const entry = byId.get(id);
      return entry ? [entry] : [];
    }),
  };
}

function sectionOf(
  zone: { id: CardZoneId; title: string; rows: CardDisplayRow[] },
  onCard: Set<string>,
  order: Map<string, number>,
  hint?: string,
): EditSection {
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
    hint: chosen.length + spare.length > 0 ? undefined : hint,
    rows: [
      ...chosen.map((row) => ({ row, onCard: true })),
      ...spare.map((row) => ({ row, onCard: false })),
    ],
  };
}

function buildSections(card: Card, items: ContactItem[], cards: Card[], scaffold?: ScaffoldZone[]): EditSection[] {
  const onCard = new Set(card.contactItemIds);
  const order = new Map(card.contactItemIds.map((id, index) => [id, index]));
  const grouped = groupEditSections(items.filter(isContactFilled), card, cards);
  const built = grouped.map((zone) => sectionOf(zone, onCard, order));
  if (!scaffold?.length) return built.map(withNewSectionHint);

  const hidden = new Set((card.hiddenZones ?? []).flatMap((id) => (id ? [id] : [])));
  const byId = new Map(built.map((section) => [section.id, section]));
  const seeded = scaffold.flatMap((zone) => {
    if (hidden.has(zone.id)) return [];
    const found = byId.get(zone.id);
    if (found) return [{ ...found, hint: found.rows.length > 0 ? undefined : zone.hint, required: zone.required }];
    return [
      {
        ...sectionOf(
          { id: zone.id, title: zoneTitle(card, zone.id, zone.title), rows: [] },
          onCard,
          order,
          zone.hint,
        ),
        required: zone.required,
      },
    ];
  });
  const rest = built.filter((section) => !scaffold.some((zone) => zone.id === section.id)).map(withNewSectionHint);
  return [...seeded, ...rest];
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
      className="relative z-10 h-full w-[30px] items-start justify-end"
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

/** An extra shelf with no rows left in it, titled or not. Removed when EDIT closes. */
function vacantExtraId(card: Card) {
  for (const id of card.rubricOrder ?? []) {
    if (!isExtraZoneId(id)) continue;
    if (Object.values(card.itemZones ?? {}).some((zone) => zone === id)) continue;
    return id;
  }
  return null;
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

/** Files, and a section opened from the plus. Position, Web, Social and About stay text. */
function offersFileAdd(zoneId: CardZoneId) {
  return zoneId === "files" || isExtraZoneId(zoneId);
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
  required = false,
}: {
  title: string;
  included: boolean;
  editing: boolean;
  hideReady: boolean;
  /** New extra shelf: the label slot shows TITLE until a name is typed. */
  pill?: boolean;
  /** A new zone: Enter in the title moves into the value on the same row. */
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
  required?: boolean;
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
      className={
        pill
          ? "bg-transparent t-label text-[var(--grey)] caret-[var(--ink)]"
          : "bg-transparent text-[16px] leading-normal text-[var(--ink)] caret-[var(--ink)]"
      }
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
            {required ? <span className="text-[var(--grey)]"> *</span> : null}
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
  scaffold,
}: {
  card: Card;
  items: ContactItem[];
  composeOnMount?: boolean;
  openAddRef?: RefObject<(() => void) | null>;
  onComposingChange?: (open: boolean) => void;
  /** Empty named zones for the cold-entry form. Omitted on the card itself. */
  scaffold?: ScaffoldZone[];
}) {
  const card = useAppStore((state) => state.cards.find((entry) => entry.id === cardProp.id) ?? cardProp);
  const items = useAppStore((state) => state.contactItems);
  void _items;
  const updateCard = useAppStore((state) => state.updateCard);
  const updateContactItem = useAppStore((state) => state.updateContactItem);
  const addItemToCard = useAppStore((state) => state.addItemToCard);
  const removeItemFromCard = useAppStore((state) => state.removeItemFromCard);
  const setCardItemOrder = useAppStore((state) => state.setCardItemOrder);
  const updateContactItemAttachment = useAppStore((state) => state.updateContactItemAttachment);
  const setRubricLabel = useAppStore((state) => state.setRubricLabel);
  const addCustomZone = useAppStore((state) => state.addCustomZone);
  const hideZone = useAppStore((state) => state.hideZone);
  const addContactItem = useAppStore((state) => state.addContactItem);
  const deleteContactItem = useAppStore((state) => state.deleteContactItem);

  const [textEditId, setTextEditId] = useState<string | null>(null);
  const [sectionEditId, setSectionEditId] = useState<string | null>(null);
  const [seedZoneId, setSeedZoneId] = useState<string | null>(null);
  const advanceSeedRef = useRef(false);
  const [deleteReadyId, setDeleteReadyId] = useState<string | null>(null);
  const [hideReadyId, setHideReadyId] = useState<string | null>(null);
  const openZoneRef = useRef<((zone: CardZoneId) => void) | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [duplicateNotice, setDuplicateNotice] = useState(0);
  const [seedHint, setSeedHint] = useState<string | null>(null);
  const [seedTyped, setSeedTyped] = useState("");
  const [lookingFor, setLookingFor] = useState(false);
  const zoneDownRef = useRef<string | null>(null);
  const viewportResizeAt = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const extraBlockRef = useRef<HTMLDivElement>(null);
  const extraValueRef = useRef<WrapFieldHandle>(null);
  const keepExtraRef = useRef(false);
  const composeOnce = useRef(false);
  const passCard = useAppStore((state) => {
    const labels = state.cards.find((entry) => entry.id === card.id)?.rubricLabels;
    return labels?.about === "Event" || labels?.additional === "Event";
  });

  const refuseDuplicate = useCallback((twinId: string) => {
    tick();
    flashRow(listRef.current?.querySelector<HTMLElement>(`[data-item-row="${CSS.escape(twinId)}"]`));
    setDuplicateNotice((count) => count + 1);
  }, []);

  useEffect(() => () => onComposingChange?.(false), [onComposingChange]);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const mark = () => {
      viewportResizeAt.current = Date.now();
    };
    viewport.addEventListener("resize", mark);
    return () => viewport.removeEventListener("resize", mark);
  }, []);

  useEffect(() => {
    const cardId = card.id;
    return () => {
      editRowOrder.delete(cardId);
      const live = useAppStore.getState().cards.find((entry) => entry.id === cardId);
      if (!live) return;
      const hide = useAppStore.getState().hideZone;
      let leftover = vacantExtraId(live);
      while (leftover) {
        hide(cardId, leftover);
        const next = useAppStore.getState().cards.find((entry) => entry.id === cardId);
        leftover = next ? vacantExtraId(next) : null;
      }
    };
  }, [card.id]);

  useEffect(() => {
    const focusSeed = (zone: string, title: boolean) => {
      if (!title && extraValueRef.current) {
        extraValueRef.current.focusEnd();
        return;
      }
      const section = listRef.current?.querySelector(`[data-zone="${CSS.escape(zone)}"]`);
      const field = section?.querySelector<HTMLElement>("[contenteditable]");
      field?.focus();
      field?.scrollIntoView({ block: "nearest" });
    };
    const begin = (zone: string, title: boolean) => {
      flushSync(() => {
        setTextEditId(null);
        setDeleteReadyId(null);
        setHideReadyId(null);
        setSeedHint(null);
        setSeedTyped("");
        setLookingFor(false);
        setSeedZoneId(zone);
        setSectionEditId(title ? zone : null);
      });
      focusSeed(zone, title);
    };
    openZoneRef.current = (zone) => begin(zone, false);
    if (openAddRef) {
      openAddRef.current = () => {
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
        begin(id, true);
      };
    }
    if (composeOnMount && !composeOnce.current) {
      composeOnce.current = true;
      openAddRef?.current?.();
    }
    return () => {
      openZoneRef.current = null;
      if (openAddRef) openAddRef.current = null;
    };
  });

  const sections = useMemo(
    () =>
      buildSections(card, items, useAppStore.getState().cards, scaffold).map((section) =>
        freezeSection(section, zonesOrder(card.id)),
      ),
    [card, items, scaffold],
  );

  useEffect(() => {
    onComposingChange?.(Boolean(seedZoneId));
  }, [onComposingChange, seedZoneId]);

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
      const ids = zonesOrder(card.id).get(zoneId);
      const live = useAppStore.getState().cards.find((entry) => entry.id === card.id);
      if (!ids || !live) return;
      const onCard = new Set(live.contactItemIds);
      const visual = ids.filter((id) => onCard.has(id));
      const zoneSet = new Set(ids);
      let placed = false;
      const next: string[] = [];
      for (const id of live.contactItemIds) {
        if (!zoneSet.has(id)) {
          next.push(id);
          continue;
        }
        if (!placed) {
          next.push(...visual);
          placed = true;
        }
      }
      if (!placed) next.push(...visual);
      const same = next.length === live.contactItemIds.length && next.every((id, index) => id === live.contactItemIds[index]);
      if (!same) setCardItemOrder(card.id, next);
    },
    [card.id, include, removeItemFromCard, setCardItemOrder],
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
    if (!zoneId || zoneId === seedZoneId) {
      setSeedHint(null);
      setLookingFor(false);
    }
  };

  const noteAdded = () => {
    const user = useAppStore.getState().user;
    if (!user.firstRowHintSeen) useAppStore.getState().markFirstRowHintSeen();
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
    const countryHint = messengerCountryHint(value);
    if (countryHint) {
      setSeedHint(countryHint);
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
    if (lookingFor) {
      const state = useAppStore.getState();
      addItemToCard(card.id, id, LOOKING_FOR_ZONE);
      state.setRubricLabel(card.id, LOOKING_FOR_ZONE, LOOKING_FOR);
      const order = state.cards.find((entry) => entry.id === card.id)?.rubricOrder ?? [];
      if (order.length > 0 && !order.includes(LOOKING_FOR_ZONE)) state.setCardRubricOrder(card.id, [...order, LOOKING_FOR_ZONE]);
    } else {
      addItemToCard(card.id, id, zoneId);
      const named = useAppStore.getState().cards.find((entry) => entry.id === card.id)?.rubricLabels?.[zoneId]?.trim() ?? "";
      if (!named && isExtraZoneId(zoneId)) {
        const label = labelForNewZone("", value);
        if (label) useAppStore.getState().setRubricLabel(card.id, zoneId, label);
      }
    }
    noteAdded();
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
      const named = useAppStore.getState().cards.find((entry) => entry.id === card.id)?.rubricLabels?.[zoneId]?.trim() ?? "";
      if (!named && isExtraZoneId(zoneId)) {
        const label = labelForNewZone("", file.name);
        if (label) useAppStore.getState().setRubricLabel(card.id, zoneId, label);
      }
      noteAdded();
      endSeed(zoneId);
    });
  };

  const stayInSeed = (event: FocusEvent<HTMLDivElement>) =>
    Boolean(extraBlockRef.current?.contains(event.relatedTarget as Node | null));
  const showChecks = !scaffold;

  return (
    <div
      ref={listRef}
      data-card-chip-list={card.id}
      data-card-content
    >
      {sections.map((section, index) => {
        const seedingThis = seedZoneId === section.id;
        const fileHere = offersFileAdd(section.id);
        const fresh = seedingThis && isExtraZoneId(section.id) && section.rows.length === 0;
        const bare = Boolean(section.hint) && !seedingThis;
        const zone = (
          <section
            data-zone={section.id}
            {...(seedingThis ? { "data-seed-zone": "" } : {})}
            className={cn(
              "min-w-0 py-[18px]",
              index < sections.length - 1 && "border-b border-[var(--rule)]",
            )}
          >
            <div
              ref={seedingThis ? extraBlockRef : undefined}
              className={cn(
                fresh
                  ? "flex min-w-0 items-stretch"
                  : "grid grid-cols-[86px_minmax(0,1fr)] items-start gap-x-[14px]",
              )}
            >
              <div className={cn("min-w-0", fresh && "w-[86px] shrink-0", bare && "text-[var(--placeholder)]", bare && showChecks && "[&_[data-section-number]]:text-[var(--placeholder)]")}>
                <SectionNumber value={sectionNumberLabel(index)} />
                <div className="mt-[6px]">
                  <SectionLabel
                    title={section.title}
                    included={section.included}
                    editing={sectionEditId === section.id}
                    hideReady={hideReadyId === section.id}
                    pill={isExtraZoneId(section.id)}
                    seed={seedingThis}
                    required={section.required}
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
              {fresh ? (
                <div aria-hidden className="mx-[14px] w-px self-stretch bg-[var(--rule)]" />
              ) : null}
              <ValueCap className={cn("flex min-w-0 flex-col gap-[6px]", fresh && "flex-1")}>
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
                      checks={showChecks}
                    />
                  );
                })}
                {seedingThis ? (
                  <div className="flex min-w-0 flex-col gap-[6px]">
                    {seedHint ? <p className="t-meta text-[var(--ink)]">{seedHint}</p> : null}
                    {passCard && !lookingFor ? (
                      <button
                        type="button"
                        data-no-swipe
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setLookingFor(true);
                          extraValueRef.current?.focusEnd();
                        }}
                        className="block border-0 bg-transparent p-0 text-left t-meta text-[var(--grey)]"
                      >
                        {LOOKING_FOR}
                      </button>
                    ) : null}
                    <div className="flex min-w-0 items-start gap-[11px]">
                      {lookingFor ? (
                        <span className="shrink-0 pt-[3px] t-label">{LOOKING_FOR}</span>
                      ) : fileHere ? (
                        <FileAddButton
                          onPointerDown={() => {
                            advanceSeedRef.current = true;
                          }}
                          onClick={() => addSeedFile(section.id)}
                        />
                      ) : null}
                      <div data-seed-value="" className="flex min-w-0 flex-1 items-baseline">
                        {section.id === "social" || section.id === "contact" ? (
                          typedMark(seedTyped) ? (
                            <span className="t-body shrink-0 text-[var(--grey)]">{typedMark(seedTyped)}</span>
                          ) : null
                        ) : null}
                        <WrapField
                          ref={extraValueRef}
                          initial={section.hint?.includes("@") ? section.hint : ""}
                          label={ADD_PLACEHOLDER}
                          placeholder={section.rows.length > 0 ? undefined : seedPlaceholder(section)}
                          placeholderClassName="t-body text-[var(--placeholder)]"
                          multiline={section.id === "about"}
                          breakButton={false}
                          onPointerDown={() => {
                            advanceSeedRef.current = true;
                          }}
                          onTextChange={(next) => {
                            setSeedTyped(next);
                            setSeedHint(null);
                          }}
                          onDone={(next) => {
                            if (section.hint && next.trim() === section.hint.trim()) {
                              endSeed(section.id);
                              return;
                            }
                            seedItem(section.id, next);
                          }}
                          onEmptyDelete={() => {
                            if (section.title.trim() || extraValueRef.current?.text().trim()) return;
                            hideZone(card.id, section.id);
                            endSeed(section.id);
                          }}
                          onBlur={(next, event) => {
                            if (stayInSeed(event)) return;
                            if (!next.trim()) {
                              if (!section.title.trim()) hideZone(card.id, section.id);
                              endSeed(section.id);
                              return;
                            }
                            if (section.hint && next.trim() === section.hint.trim()) {
                              endSeed(section.id);
                              return;
                            }
                            seedItem(section.id, next);
                          }}
                          className="bg-transparent t-body text-[var(--ink)] caret-[var(--ink)]"
                        />
                      </div>
                      {showChecks ? (
                        <div className="pointer-events-none">
                          <LibraryCheck onCard={false} onToggle={() => undefined} />
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : bare ? (
                  <button
                    type="button"
                    data-no-swipe
                    aria-label={section.title}
                    className="t-body w-full bg-transparent text-left text-[var(--placeholder)]"
                    onPointerDown={() => {
                      zoneDownRef.current = section.id;
                    }}
                    onClick={() => {
                      if (zoneDownRef.current !== section.id) return;
                      if (Date.now() - viewportResizeAt.current < 350) return;
                      openZoneRef.current?.(section.id);
                    }}
                  >
                    {section.hint}
                  </button>
                ) : (
                    <button
                      type="button"
                      data-no-swipe
                      data-zone-add=""
                      aria-label="Add to section"
                      className="t-body w-full bg-transparent text-left"
                      style={{ color: OFF_CARD }}
                      onPointerDown={() => {
                        keepExtraRef.current = isExtraZoneId(section.id);
                        zoneDownRef.current = section.id;
                      }}
                      onClick={() => {
                        if (zoneDownRef.current !== section.id) return;
                        if (Date.now() - viewportResizeAt.current < 350) return;
                        openZoneRef.current?.(section.id);
                      }}
                    >
                      +
                    </button>
                )}
              </ValueCap>
            </div>
          </section>
        );
        return <Fragment key={section.id}>{zone}</Fragment>;
      })}
      {duplicateNotice > 0 ? (
        <SkyToast key={duplicateNotice} text={DUPLICATE_NOTICE} onDone={() => setDuplicateNotice(0)} />
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
  checks = true,
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
  /** Library tick. The registration form leaves it off. */
  checks?: boolean;
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
  const [liveText, setLiveText] = useState(value);
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

  const side = checks || deleteReady ? "mr-[26px]" : "";
  return (
    <div ref={rowRef} data-item-row={itemId} className="relative min-w-0">
      {editing ? (
        <div className={cn(side, "flex min-w-0 items-baseline")}>
          {zoneId === "social" || zoneId === "contact" ? (
            typedMark(liveText) ? (
              <span className="t-body shrink-0 text-[var(--grey)]">{typedMark(liveText)}</span>
            ) : null
          ) : null}
          <WrapField
            ref={dockRef}
            initial={value}
            label="Edit row"
            multiline={multiline}
            breakButton={false}
            onTextChange={(next) => {
              setLiveText(next);
              if (!next.trim()) onErase(itemId);
            }}
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
        </div>
      ) : (
      <div
        ref={fieldRef}
        aria-label={text}
        data-no-swipe
        className={cn(
          side,
          "min-w-0 overflow-clip",
          (holding || deleteReady) && "opacity-40",
        )}
        style={{
          color: onCard ? "var(--ink)" : OFF_CARD,
        }}
        onPointerDown={(event) => {
          if (deleteReady) return;
          pressedLong.current = false;
          setHolding(true);
          longPress.onPointerDown(event);
        }}
        onPointerMove={longPress.onPointerMove}
        onPointerUp={(event) => {
          release();
          if (pressedLong.current || deleteReady) return;
          if (!(event.target instanceof Node) || !fieldRef.current?.contains(event.target)) return;
          beginEdit();
        }}
        onPointerCancel={release}
        onContextMenu={longPress.onContextMenu}
      >
        <div
          ref={lineRef}
          className={cn(
            "t-body origin-left select-none",
            multiline || isProseValue(value) || value.includes("\n") || value.includes("  ")
              ? "w-full whitespace-pre-wrap break-words"
              : "w-max whitespace-nowrap",
          )}
        >
          {text}
        </div>
      </div>
      )}
      {statusLine ? (
        uploadFailed ? (
          <button
            type="button"
            data-no-swipe
            onClick={() => onRetryFile(itemId)}
            className={cn(side, "block text-left t-meta text-[var(--grey)]")}
          >
            {statusLine}
          </button>
        ) : (
          <span className={cn(side, "block t-meta text-[var(--grey)]")}>{statusLine}</span>
        )
      ) : null}
      {fades && !editing && !multiline && !isProseValue(value) && !value.includes("\n") ? (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 w-4 bg-gradient-to-r from-transparent to-white",
            checks ? "right-[26px]" : "right-0",
          )}
        />
      ) : null}
      {deleteReady ? (
        <div className="absolute top-0 right-0 flex items-start">
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
        </div>
      ) : checks ? (
        <div className="absolute inset-y-0 right-0 flex w-[30px] items-start justify-end">
          <LibraryCheck onCard={onCard} onToggle={() => onToggle(itemId, zoneId)} />
        </div>
      ) : null}
    </div>
  );
});
