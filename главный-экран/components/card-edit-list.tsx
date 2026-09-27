"use client";

import { Minus, Plus, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { cn } from "@/lib/utils";
import { useLongPress } from "@/shared/hooks/use-long-press";
import { groupLibrary, type CardDisplayRow, type CardZoneId } from "@/shared/services/card-zones";
import { isContactFilled } from "@/shared/services/contact-item";
import { customDisplayName } from "@/shared/services/link-display";
import { useAppStore } from "@/shared/store/app-store";
import type { Card, ContactItem } from "@/shared/types";
import { openContactAttachmentPicker } from "@landing/components/photo-input-utils";

const HOLD_MS = 500;
const OFF_CARD = "#C8C8C8";
const DELETE_RED = "#E23B2F";
const ADD_PLACEHOLDER = "Add link, file, text, contact…";
const ADD_GAP_PX = 12;
/** A keyboard is at least this tall; smaller viewport changes are browser chrome. */
const KEYBOARD_MIN_PX = 120;
/** Until the keyboard reports its height, keep the line above where any iPhone keyboard ends. */
const PRE_KEYBOARD_BOTTOM = 0.45;

/**
 * Scroll only the card body so the add line sits just above the keyboard.
 * The line is lifted before the keyboard rises, so iOS never pans the whole page.
 */
function placeAddLine(line: HTMLElement) {
  const scroller = line.closest<HTMLElement>(".compass-card-scroll");
  if (!scroller) return;
  const viewport = window.visualViewport;
  const visibleTop = viewport?.offsetTop ?? 0;
  const visibleHeight = viewport?.height ?? window.innerHeight;
  const keyboardUp = window.innerHeight - visibleHeight > KEYBOARD_MIN_PX;
  const bottomLimit = keyboardUp
    ? visibleTop + visibleHeight - ADD_GAP_PX
    : window.innerHeight * PRE_KEYBOARD_BOTTOM;
  const topLimit = Math.max(scroller.getBoundingClientRect().top, visibleTop) + ADD_GAP_PX;
  const rect = line.getBoundingClientRect();
  if (rect.bottom > bottomLimit) scroller.scrollTop += rect.bottom - bottomLimit;
  else if (rect.top < topLimit) scroller.scrollTop -= topLimit - rect.top;
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

  const [open, setOpen] = useState(openOnMount);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const pickingRef = useRef(false);

  const focusField = useCallback(() => {
    const field = fieldRef.current;
    const line = lineRef.current;
    if (!field || !line) return;
    field.focus({ preventScroll: true });
    const end = field.value.length;
    field.setSelectionRange(end, end);
    placeAddLine(line);
  }, []);

  useLayoutEffect(() => {
    if (openOnMount) focusField();
  }, [openOnMount, focusField]);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!open || !viewport) return;
    const follow = () => {
      const line = lineRef.current;
      if (line && document.activeElement === fieldRef.current) placeAddLine(line);
    };
    viewport.addEventListener("resize", follow);
    return () => viewport.removeEventListener("resize", follow);
  }, [open]);

  const commitText = () => {
    const value = text.trim();
    setText("");
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

  // iOS raises the keyboard only when focus lands inside the tap itself, so the input
  // must be in the DOM before this handler returns.
  const openLine = () => {
    flushSync(() => {
      setError(null);
      setOpen(true);
    });
    focusField();
  };

  const settleAfterPicker = () => {
    pickingRef.current = false;
    focusField();
    if (document.activeElement !== fieldRef.current) close();
  };

  const pickFile = () => {
    pickingRef.current = true;
    openContactAttachmentPicker((dataUrl, file) => {
      const id = addContactItem();
      if (id) {
        const result = updateContactItemAttachment(cardId, id, file, dataUrl);
        if (result.ok) {
          setError(null);
        } else {
          deleteContactItem(id);
          setError(result.message);
        }
      }
      settleAfterPicker();
    }, settleAfterPicker);
  };

  const errorNote = error ? (
    <p className="mb-2 text-[12px] leading-snug text-destructive">{error}</p>
  ) : null;

  if (!open) {
    return (
      <div className={cn("pt-6 pb-2", divided && "mt-2 border-t-[0.5px] border-[#111]")}>
        {errorNote}
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
    );
  }

  return (
    <>
      <div className={cn("pt-6 pb-2", divided && "mt-2 border-t-[0.5px] border-[#111]")}>
        {errorNote}
        <div ref={lineRef} className="flex items-center gap-[11px] border-b-[0.5px] border-[#111] py-2">
          <button
            type="button"
            data-no-swipe
            aria-label="Add photo or file"
            onPointerDown={(event) => event.preventDefault()}
            onClick={pickFile}
            className="flex w-7 shrink-0 items-center justify-center text-[#111]"
          >
            <Plus className="size-7 text-[#111]" strokeWidth={1} aria-hidden />
          </button>
          <input
            ref={fieldRef}
            data-no-swipe
            value={text}
            placeholder={ADD_PLACEHOLDER}
            aria-label={ADD_PLACEHOLDER}
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="done"
            onFocus={() => {
              onFocus();
              if (lineRef.current) placeAddLine(lineRef.current);
            }}
            onChange={(event) => {
              setError(null);
              setText(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              commitText();
            }}
            onBlur={() => {
              if (!pickingRef.current) close();
            }}
            className="compass-input m-0 min-w-0 flex-1 bg-transparent p-0 text-[18.2px] leading-[1.35] font-normal tracking-[-0.015em] text-[#111] outline-none placeholder:text-[15.4px] placeholder:font-normal placeholder:tracking-normal placeholder:text-[#999]"
          />
        </div>
      </div>
      {/* Room below the line so the card body itself can lift it above the keyboard. */}
      <div aria-hidden className="h-[60svh]" />
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
  const editorRef = useRef<HTMLDivElement>(null);
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

  // Runs inside the tap's flushSync, so iOS still treats the focus as user-initiated
  // and raises the keyboard. The caret starts at the end of the full text.
  useLayoutEffect(() => {
    if (!editing) return;
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [editing]);

  const editedText = () => (editorRef.current?.textContent ?? "").replace(/\s*\n\s*/g, " ");

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
          <div
            ref={editorRef}
            role="textbox"
            aria-label="Edit row"
            aria-multiline
            contentEditable="plaintext-only"
            suppressContentEditableWarning
            enterKeyHint="done"
            autoCorrect="off"
            spellCheck={false}
            data-no-swipe
            onInput={() => {
              if (!editedText().trim()) onErase();
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              onConfirm(editedText());
            }}
            onBlur={(event) => {
              if (Date.now() - openedAt.current < 700) {
                event.currentTarget.focus({ preventScroll: true });
                return;
              }
              onConfirm(editedText());
            }}
            className="compass-input min-w-0 flex-1 text-[16px] leading-[1.45] font-normal tracking-[-0.015em] break-words whitespace-pre-wrap text-[#111] caret-[#111] outline-none select-text"
          >
            {draft}
          </div>
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
