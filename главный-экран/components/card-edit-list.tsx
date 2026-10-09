"use client";

import { File as FileIcon, Minus, Plus, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal, flushSync } from "react-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import { SectionNumber, ValueCap, sectionNumberLabel } from "@/shared/components/section-number";
import { useLongPress } from "@/shared/hooks/use-long-press";
import { DELETE_HOLD_MS } from "@/shared/lib/reorder-hold";
import {
  effectiveZone,
  groupLibrary,
  orderCardZones,
  zoneForItem,
  type CardDisplayRow,
  type CardZoneId,
} from "@/shared/services/card-zones";
import { detectContactType, isContactFilled, messengerCountryHint } from "@/shared/services/contact-item";
import { WrapField, type WrapFieldHandle } from "./wrap-field";
import { customDisplayName } from "@/shared/services/link-display";
import { SkyHint } from "@/shared/components/sky-hint";
import { useAppStore } from "@/shared/store/app-store";
import type { Card, ContactItem } from "@/shared/types";
import { itemPhotoSrc } from "@/shared/services/card-photo";
import { useKeyboardDock } from "@main/hooks/use-keyboard-dock";
import { openContactAttachmentPicker } from "@landing/components/photo-input-utils";

const OFF_CARD = "var(--placeholder)";
const DELETE_RED = "#E23B2F";
const ADD_PLACEHOLDER = "Add link, file, text, contact…";
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

/** A finished link, name, or role. Enter closes it. Prose keeps the line break. */
function enterFinishes(value: string) {
  const line = value.trim();
  if (!line || line.includes("\n")) return false;
  if (detectContactType(line) !== "text") return true;
  return (
    zoneForItem({
      id: "draft",
      type: "text",
      label: "",
      value: line,
      url: "",
      order: 0,
    }) !== "additional"
  );
}

function buildSections(card: Card, items: ContactItem[]): EditSection[] {
  const onCard = new Set(card.contactItemIds);
  const order = new Map(card.contactItemIds.map((id, index) => [id, index]));
  const grouped = groupLibrary(items.filter(isContactFilled), card);

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
      style={{ color: OFF_CARD }}
    >
      {onCard ? (
        <Minus className="size-5" strokeWidth={1} aria-hidden />
      ) : (
        <Plus className="size-5" strokeWidth={1} aria-hidden />
      )}
    </button>
  );
}

function SectionLabel({
  title,
  included,
  editing,
  onEdit,
  onCommit,
}: {
  title: string;
  included: boolean;
  editing: boolean;
  onEdit: () => void;
  onCommit: (next: string) => void;
}) {
  const labelRef = useRef<HTMLButtonElement>(null);
  const dockRef = useRef<WrapFieldHandle>(null);
  const dockBottom = useKeyboardDock(editing, true);
  const openedAt = useRef(0);
  const [frame, setFrame] = useState({ left: 0, width: 0 });

  const begin = () => {
    openedAt.current = Date.now();
    flushSync(() => {
      onEdit();
    });
  };

  useLayoutEffect(() => {
    if (!editing) return;
    const list = labelRef.current?.closest("[data-card-chip-list]");
    const rect = list?.getBoundingClientRect();
    if (rect) setFrame({ left: rect.left, width: rect.width });
    dockRef.current?.focusEnd();
  }, [editing]);

  return (
    <>
      <button
        ref={labelRef}
        type="button"
        className={cn(
          "t-label block w-full whitespace-normal line-clamp-3 bg-transparent text-left",
          editing && "invisible pointer-events-none",
        )}
        style={{ color: included ? "var(--grey)" : OFF_CARD }}
        onPointerUp={() => {
          if (editing) return;
          begin();
        }}
      >
        {title}
      </button>
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
                <div className="flex flex-col justify-end border-b border-[var(--rule)]">
                  <WrapField
                    ref={dockRef}
                    initial={title}
                    label="Section name"
                    onDone={onCommit}
                    onBlur={(next) => {
                      if (Date.now() - openedAt.current < 700) {
                        dockRef.current?.focusEnd();
                        return;
                      }
                      onCommit(next);
                    }}
                    className="bg-transparent text-[16px] leading-normal text-[var(--ink)] caret-[var(--ink)]"
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
  const setRubricLabel = useAppStore((state) => state.setRubricLabel);
  const deleteContactItem = useAppStore((state) => state.deleteContactItem);

  const [textEditId, setTextEditId] = useState<string | null>(null);
  const [sectionEditId, setSectionEditId] = useState<string | null>(null);
  const [deleteReadyId, setDeleteReadyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [libraryHint, setLibraryHint] = useState<"add" | "first" | null>(null);

  useEffect(() => () => onComposingChange?.(false), [onComposingChange]);

  const sections = useMemo(
    () => orderCardZones(buildSections(card, items), card.rubricOrder),
    [card, items],
  );

  useEffect(() => {
    if (!deleteReadyId) return;
    const dismiss = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-delete-marker], [data-delete-confirm]")) return;
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

  const askDelete = (itemId: string) => {
    setConfirmDelete(itemId);
  };

  return (
    <div data-card-chip-list={card.id} data-card-content>
      {sections.map((section, index) => (
        <section
          key={section.id}
          hidden={composing}
          className={cn("min-w-0 py-[18px]", index < sections.length - 1 && "border-b border-[var(--rule)]")}
        >
          <div className="grid grid-cols-[86px_minmax(0,1fr)] items-start gap-x-[14px]">
            <div className="min-w-0">
              <SectionNumber value={sectionNumberLabel(index)} />
              <div className="mt-[6px]">
                <SectionLabel
                  title={section.title}
                  included={section.included}
                  editing={sectionEditId === section.id}
                  onEdit={() => {
                    setTextEditId(null);
                    setDeleteReadyId(null);
                    setSectionEditId(section.id);
                  }}
                  onCommit={(next) => {
                    setRubricLabel(card.id, section.id, next);
                    setSectionEditId(null);
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
                    text={lineOf(row)}
                    value={row.value}
                    multiline={
                      item.type === "text" &&
                      (item.value.includes("\n") || effectiveZone(card, item) === "additional")
                    }
                    onCard={onCard}
                    editing={textEditId === item.id}
                    deleteReady={deleteReadyId === item.id}
                    onArmDelete={() => setDeleteReadyId(item.id)}
                    onDelete={() => askDelete(item.id)}
                    onAdd={() => include(item.id)}
                    onRemove={() => removeItemFromCard(card.id, item.id)}
                    onEdit={() => {
                      setDeleteReadyId(null);
                      setSectionEditId(null);
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
            </ValueCap>
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
          if (open && !useAppStore.getState().user.addLibraryHintSeen) setLibraryHint("add");
        }}
        onAdded={() => {
          const user = useAppStore.getState().user;
          if (user.firstRowHintSeen) return;
          if (!user.addLibraryHintSeen) useAppStore.getState().markAddLibraryHintSeen();
          setLibraryHint("first");
        }}
      />
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
  const [hint, setHint] = useState<string | null>(null);
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

  useEffect(() => {
    if (!openAddRef) return;
    openAddRef.current = () => {
      flushSync(startDocking);
      fieldRef.current?.focusEnd();
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
    if (open) fieldRef.current?.focusEnd();
  }, [open]);

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
    const value = text.replace(/\s*\n\s*/g, " ").trim();
    if (value) updateContactItem(itemId, { label: value });
    onAdded(itemId);
    picking.current = false;
    dismissLine();
  };

  const commit = (raw?: string) => {
    const source = raw ?? text;
    const value = fileItemId ? source.replace(/\s*\n\s*/g, " ").trim() : source.trim();
    if (fileItemId) {
      if (value) updateContactItem(fileItemId, { label: value });
      onAdded(fileItemId);
      return true;
    }
    if (!value) return true;
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
    onAdded(id);
    return true;
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
                  <WrapField
                    ref={fieldRef}
                    label={ADD_PLACEHOLDER}
                    placeholder={fileItem ? fileItem.value : ADD_PLACEHOLDER}
                    placeholderClassName="text-[16px] text-[var(--grey)]"
                    multiline={!fileItemId && !enterFinishes(text)}
                    onTextChange={(next) => {
                      setText(next);
                      setError(null);
                      setHint(null);
                    }}
                    onDone={(next) => {
                      if (!commit(next)) return;
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
                    className="bg-transparent p-0 text-[16px] leading-normal text-[var(--ink)] caret-[var(--ink)]"
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
  multiline,
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
  /** Additional text. Enter stays inside this one block. */
  multiline: boolean;
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
  const dockRef = useRef<WrapFieldHandle>(null);
  const dockBottom = useKeyboardDock(editing, true);
  const [frame, setFrame] = useState({ left: 0, width: 0 });
  const pressedLong = useRef(false);
  const openedAt = useRef(0);
  const [holding, setHolding] = useState(false);
  const [fades, setFades] = useState(false);
  const longPress = useLongPress(() => {
    pressedLong.current = true;
    setHolding(false);
    window.getSelection()?.removeAllRanges();
    try {
      navigator.vibrate?.(10);
    } catch {
      // Vibration is blocked in some browsers.
    }
    onArmDelete();
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
      onEdit();
    });
  };

  useLayoutEffect(() => {
    if (!editing) return;
    const list = rowRef.current?.closest("[data-card-chip-list]");
    const rect = list?.getBoundingClientRect();
    if (rect) setFrame({ left: rect.left, width: rect.width });
    dockRef.current?.focusEnd();
  }, [editing]);

  return (
    <div ref={rowRef} className="relative min-w-0">
      <div
        ref={fieldRef}
        aria-label={text}
        data-no-swipe
        className={cn(
          "mr-[26px] min-w-0 overflow-clip",
          editing && "invisible pointer-events-none",
          (holding || deleteReady) && "opacity-40",
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
          className={cn(
            "t-body select-none",
            value.includes("\n") || value.includes("  ") ? "w-full whitespace-pre-wrap" : "w-max whitespace-nowrap",
          )}
        >
          {text}
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
                <div className="flex flex-col justify-end border-b border-[var(--rule)]">
                  <WrapField
                    ref={dockRef}
                    initial={value}
                    label="Edit row"
                    multiline={multiline}
                    onTextChange={(next) => {
                      if (!next.trim()) onErase();
                    }}
                    onDone={onConfirm}
                    onBlur={(next) => {
                      if (!next.trim()) return;
                      if (Date.now() - openedAt.current < 700) {
                        dockRef.current?.focusEnd();
                        return;
                      }
                      onConfirm(next);
                    }}
                    className="bg-transparent text-[16px] leading-normal text-[var(--ink)] caret-[var(--ink)]"
                  />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
      {fades && !editing && !value.includes("\n") ? (
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
