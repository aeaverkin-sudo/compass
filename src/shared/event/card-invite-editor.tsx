"use client";

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/lib/utils";
import { HeroName } from "@/shared/components/hero-name";
import { MarkPlus } from "@/shared/components/mark-plus";
import { NUMBER_CLASS, SectionNumber, ValueCap } from "@/shared/components/section-number";
import { capTop, capTopEstimate } from "@/shared/lib/cap-top";
import { ARRANGE_HOLD_MS, REORDER_SLOP_PX } from "@/shared/lib/reorder-hold";
import {
  INVITE_NUMBER_MAX,
  INVITE_ROWS_MAX,
  INVITE_TITLE_MAX,
  INVITE_VALUE_MAX,
  inviteRowNumbers,
  newInviteRow,
  type InviteRow,
} from "@/shared/event/invite-rows";
import { parseInviteDate, parseInviteTime, shapeInviteDate, shapeInviteTime } from "@/shared/event/invite-when";
import type { EventFormValues } from "@/shared/event/event-form-fields";
import { PhotoSlotPicker } from "@landing/components/photo-slot-picker";
import { CARD_HEADER_PAD_PX, HEADER_FADE_PX, HERO_PHOTO_PX, SECTION_PAD_PX } from "@main/layout";

const DRAG_LIFT = "relative z-[5] origin-center bg-white shadow-[0_10px_22px_rgba(20,20,20,0.14)]";
const BARE = "m-0 block w-full min-w-0 border-0 bg-transparent p-0 outline-none placeholder:text-[var(--placeholder)]";
const FIELD = cn(BARE, "text-[var(--ink)]");
const NUMBER_ESTIMATE = capTopEstimate(32, 32);

function reorderHaptic() {
  try {
    navigator.vibrate?.(10);
  } catch {
    // Vibration is blocked in some browsers.
  }
}

function blockTouchMove(event: TouchEvent) {
  event.preventDefault();
}

/** The section number, typed. Its cap sits where the printed number's does. */
function NumberInput({ value, onChange, onDone }: { value: string; onChange: (value: string) => void; onDone: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [lift, setLift] = useState<number | null>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    setLift(capTop(node));
    node.focus();
  }, []);
  return (
    <input
      ref={ref}
      value={value}
      maxLength={INVITE_NUMBER_MAX}
      aria-label="Number"
      onChange={(event) => onChange(event.target.value)}
      onBlur={onDone}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      className={cn(NUMBER_CLASS, FIELD, "w-full")}
      style={{ marginTop: -(lift ?? NUMBER_ESTIMATE) }}
    />
  );
}

function GrowArea({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      maxLength={INVITE_VALUE_MAX}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className={cn(FIELD, "t-body resize-none overflow-hidden")}
    />
  );
}

type RowsProps = {
  values: EventFormValues;
  onChange: (patch: Partial<EventFormValues>) => void;
};

function rowFilled(row: InviteRow, values: EventFormValues) {
  if (row.kind === "place") return values.place.trim().length > 0;
  if (row.kind === "date") return values.dateText.trim().length > 0;
  if (row.kind === "time") return values.timeText.trim().length > 0;
  return Boolean(row.value?.trim());
}

/** Numbered rows of the invite card: Location, Date, Time and the organiser's own. */
export function InviteRows({ values, onChange }: RowsProps) {
  const rows = values.inviteRows;
  const listRef = useRef<HTMLDivElement>(null);
  const [focusTitle, setFocusTitle] = useState<string | null>(null);
  const [numberEditing, setNumberEditing] = useState<string | null>(null);
  const [lifted, setLifted] = useState<{ id: string; dy: number } | null>(null);
  const hold = useRef<{
    id: string;
    pointerId: number;
    startX: number;
    startY: number;
    startTop: number;
    timer: number;
    active: boolean;
  } | null>(null);
  const rowsRef = useRef(rows);
  useLayoutEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const numbers = inviteRowNumbers(rows, (row) => rowFilled(row, values));

  const setRow = (id: string, patch: Partial<InviteRow>) => {
    onChange({ inviteRows: rows.map((row) => (row.id === id ? { ...row, ...patch } : row)) });
  };

  const addRow = () => {
    if (rows.length >= INVITE_ROWS_MAX) return;
    const row = newInviteRow();
    onChange({ inviteRows: [...rows, row] });
    setFocusTitle(row.id);
  };

  const endHold = () => {
    const current = hold.current;
    if (!current) return;
    window.clearTimeout(current.timer);
    if (current.active) document.removeEventListener("touchmove", blockTouchMove, true);
    hold.current = null;
    setLifted(null);
  };

  useEffect(() => endHold, []);

  const rowNode = (id: string) => listRef.current?.querySelector<HTMLElement>(`[data-invite-row="${id}"]`) ?? null;

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>, id: string) => {
    if (event.button !== 0 || hold.current) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && event.currentTarget.contains(active) && active.matches("input, textarea")) return;
    const node = event.currentTarget;
    const pointerId = event.pointerId;
    const timer = window.setTimeout(() => {
      const current = hold.current;
      if (!current) return;
      current.active = true;
      current.startTop = node.offsetTop;
      (document.activeElement as HTMLElement | null)?.blur?.();
      document.addEventListener("touchmove", blockTouchMove, { passive: false, capture: true });
      try {
        node.setPointerCapture(pointerId);
      } catch {
        /* the pointer is already gone */
      }
      reorderHaptic();
      setLifted({ id, dy: 0 });
    }, ARRANGE_HOLD_MS);
    hold.current = { id, pointerId, startX: event.clientX, startY: event.clientY, startTop: node.offsetTop, timer, active: false };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const current = hold.current;
    if (!current || event.pointerId !== current.pointerId) return;
    if (!current.active) {
      if (Math.hypot(event.clientX - current.startX, event.clientY - current.startY) > REORDER_SLOP_PX) endHold();
      return;
    }
    event.preventDefault();
    const list = rowsRef.current;
    const index = list.findIndex((row) => row.id === current.id);
    const neighbours = [list[index - 1], list[index + 1]];
    let next = list;
    const above = neighbours[0] ? rowNode(neighbours[0].id) : null;
    const below = neighbours[1] ? rowNode(neighbours[1].id) : null;
    if (above) {
      const rect = above.getBoundingClientRect();
      if (event.clientY < rect.top + rect.height / 2) {
        next = [...list];
        [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
      }
    }
    if (next === list && below) {
      const rect = below.getBoundingClientRect();
      if (event.clientY > rect.top + rect.height / 2) {
        next = [...list];
        [next[index + 1], next[index]] = [next[index]!, next[index + 1]!];
      }
    }
    if (next !== list) {
      reorderHaptic();
      rowsRef.current = next;
      onChange({ inviteRows: next });
    }
    setLifted({ id: current.id, dy: event.clientY - current.startY });
  };

  useLayoutEffect(() => {
    const current = hold.current;
    if (!current?.active || !lifted) return;
    const node = rowNode(current.id);
    if (!node) return;
    const shift = node.offsetTop - current.startTop;
    node.style.transform = `translateY(${lifted.dy - shift}px) scale(1.03)`;
  });

  return (
    <div ref={listRef}>
      <div className="border-t border-[var(--rule)]">
        {rows.map((row, index) => {
          const filled = rowFilled(row, values);
          const isLifted = lifted?.id === row.id;
          const typedNumber = row.number ?? "";
          const showNumber = typedNumber || (row.kind === "custom" && !filled ? "" : numbers[index]);
          const dateWrong = row.kind === "date" && values.dateText.trim() && !parseInviteDate(values.dateText);
          const timeWrong = row.kind === "time" && values.timeText.trim() && !parseInviteTime(values.timeText);
          return (
            <section
              key={row.id}
              data-invite-row={row.id}
              onPointerDown={(event) => onPointerDown(event, row.id)}
              onPointerMove={onPointerMove}
              onPointerUp={endHold}
              onPointerCancel={endHold}
              className={cn(
                "relative min-w-0 py-[18px] select-none",
                index < rows.length - 1 && "border-b border-[var(--rule)]",
                isLifted && cn(DRAG_LIFT, "touch-none"),
              )}
              style={isLifted ? undefined : { transform: "" }}
            >
              <div className="grid grid-cols-[86px_minmax(0,1fr)] items-start gap-x-[14px]">
                <div className="min-w-0">
                  {numberEditing === row.id ? (
                    <NumberInput
                      value={typedNumber}
                      onChange={(number) => setRow(row.id, { number: number.trim() ? number : undefined })}
                      onDone={() => setNumberEditing(null)}
                    />
                  ) : (
                    <button
                      type="button"
                      aria-label="Number"
                      onClick={() => setNumberEditing(row.id)}
                      className={cn(
                        "press block border-0 bg-transparent p-0 text-left [-webkit-tap-highlight-color:transparent]",
                        !filled && !typedNumber && "[&_[data-section-number]]:!text-[var(--placeholder)]",
                      )}
                    >
                      {showNumber ? (
                        <SectionNumber value={showNumber} />
                      ) : (
                        <ValueCap>
                          <span className="t-body block text-[var(--placeholder)]">number</span>
                        </ValueCap>
                      )}
                    </button>
                  )}
                  <input
                    value={row.title}
                    maxLength={INVITE_TITLE_MAX}
                    aria-label="Title"
                    placeholder="title"
                    autoFocus={focusTitle === row.id}
                    onFocus={() => setFocusTitle(null)}
                    onChange={(event) => setRow(row.id, { title: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                    className={cn(BARE, "t-label mt-[6px]")}
                  />
                </div>
                <ValueCap className="min-w-0">
                  {row.kind === "place" ? (
                    <input
                      value={values.place}
                      maxLength={240}
                      aria-label={row.title || "Location"}
                      placeholder="Venue, address"
                      onChange={(event) => onChange({ place: event.target.value })}
                      className={cn(FIELD, "t-body")}
                    />
                  ) : row.kind === "date" ? (
                    <input
                      value={values.dateText}
                      inputMode="numeric"
                      maxLength={10}
                      aria-label={row.title || "Date"}
                      placeholder="12.10.26"
                      onChange={(event) => {
                        const dateText = shapeInviteDate(event.target.value);
                        onChange({ dateText, date: parseInviteDate(dateText) ?? "" });
                      }}
                      className={cn(FIELD, "t-body")}
                    />
                  ) : row.kind === "time" ? (
                    <input
                      value={values.timeText}
                      inputMode="numeric"
                      maxLength={11}
                      aria-label={row.title || "Time"}
                      placeholder="15:30–20:30"
                      onChange={(event) => {
                        const timeText = shapeInviteTime(event.target.value);
                        const parsed = parseInviteTime(timeText);
                        onChange({ timeText, time: parsed?.start ?? "", endTime: parsed?.end ?? "" });
                      }}
                      className={cn(FIELD, "t-body")}
                    />
                  ) : (
                    <GrowArea
                      value={row.value ?? ""}
                      onChange={(value) => setRow(row.id, { value })}
                      placeholder="description"
                      ariaLabel={row.title || "Description"}
                    />
                  )}
                  {dateWrong ? <p className="m-0 mt-1 t-meta text-[var(--grey)]">Use 12.10.26</p> : null}
                  {timeWrong ? <p className="m-0 mt-1 t-meta text-[var(--grey)]">Use 15:30–20:30</p> : null}
                </ValueCap>
              </div>
            </section>
          );
        })}
      </div>
      {rows.length < INVITE_ROWS_MAX ? (
        <div className="flex justify-center border-t border-[var(--rule)] pt-[18px]">
          <button
            type="button"
            aria-label="Add a row"
            onClick={addRow}
            className="press flex size-11 items-center justify-center border-0 bg-transparent p-0 text-[var(--ink)] [-webkit-tap-highlight-color:transparent]"
          >
            <MarkPlus />
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** The ADED card as the invite editor: logo and name on top, numbered rows below. */
export function CardInviteEditor({
  values,
  onChange,
  logoUrl,
  onLogoFile,
  onRemoveLogo,
}: RowsProps & {
  logoUrl: string | null;
  onLogoFile: (file: File) => void;
  onRemoveLogo?: () => void;
}) {
  return (
    <div className="w-full">
      <div
        className="flex shrink-0 items-stretch gap-3"
        style={{
          height: HERO_PHOTO_PX,
          marginTop: SECTION_PAD_PX,
          marginBottom: CARD_HEADER_PAD_PX + HEADER_FADE_PX - SECTION_PAD_PX,
        }}
      >
        <PhotoSlotPicker
          photo={logoUrl}
          onPhotoChange={(photo, file) => {
            if (file) onLogoFile(file);
            else if (!photo) onRemoveLogo?.();
          }}
          sizePx={HERO_PHOTO_PX}
          borderRadiusPx={0}
          photoLook={values.logoLook ?? undefined}
          onPhotoLook={(logoLook) => onChange({ logoLook })}
        />
        <div className="relative flex h-full min-w-0 flex-1 flex-col">
          <HeroName value={values.name} onChange={(name) => onChange({ name })} placeholder="Event name" maxLines={3} align="center" />
        </div>
      </div>
      <InviteRows values={values} onChange={onChange} />
    </div>
  );
}
