"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type RefObject } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Zone } from "@/shared/components/zone";
import { MarkPlus } from "@/shared/components/mark-plus";
import { CoverButton } from "@/shared/event/cover-button";
import { EVENT_LAYOUTS, EVENT_THEMES, layoutDefaultTheme } from "@/shared/event/themes";
import { VALUE_AXIS_PX } from "@/shared/layout/axes";
import { hasLightEdges } from "@/shared/lib/photo-look";
import { PhotoSlotPicker } from "@landing/components/photo-slot-picker";
import { EVENT_TITLE_LINES, clampEventTitle } from "@/shared/event/event-title";
import { formEndIso, formStartIso, type EventFormValues } from "@/shared/event/event-form-fields";
import { canonicalTimeZone, isTimeZone } from "@/shared/event/time-zone";
import {
  INVITE_BASE_LABELS,
  INVITE_CUSTOM_MAX,
  INVITE_TITLE_MAX,
  INVITE_VALUE_MAX,
  customInviteRows,
  newInviteRow,
  withInviteLabel,
  type InviteBaseKind,
  type InviteRow,
} from "@/shared/event/invite-rows";
import { inviteDateText, inviteTimeText } from "@/shared/event/invite-when";

export const PIC_ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg";

export type { EventFormValues };

const PLAIN = "w-full bg-transparent text-[var(--ink)] outline-none placeholder:text-[var(--placeholder)]";
const LABEL_FIELD =
  "t-label m-0 block w-full min-w-0 resize-none overflow-hidden border-0 bg-transparent p-0 outline-none";
const LOGO_LOOKS = ["plain", "shadow", "frame"] as const;
const SKY_BUTTON =
  "press border-0 bg-sky px-[21.6px] py-[10.8px] t-caps text-[var(--ink)] disabled:opacity-40 [-webkit-tap-highlight-color:transparent]";

function fieldStyle() {
  return {
    fontSize: 16,
    fontWeight: 400,
    letterSpacing: "-0.015em",
    lineHeight: 1.45,
    caretColor: "var(--ink)",
    fontFamily: "inherit",
  } as const;
}

function focusField(event: MouseEvent<HTMLElement>, node: HTMLElement | null) {
  const target = event.target as HTMLElement;
  if (target.closest("input, textarea, button")) return;
  node?.focus();
}

function GrowField({
  inputRef,
  value,
  onChange,
  placeholder,
  ariaLabel,
  singleLine = false,
  maxLines,
  maxLength,
  onKeyDown,
  fieldId,
}: {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  singleLine?: boolean;
  /** Enter breaks the line until this many lines. */
  maxLines?: number;
  maxLength?: number;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  /** Marks an own row's value, so a removed row can hand the focus up. */
  fieldId?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const size = (node: HTMLTextAreaElement) => {
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
    const lineBox = box.current;
    if (!lineBox) return;
    const line = parseFloat(getComputedStyle(node).lineHeight) || 23;
    lineBox.style.marginBottom = `${Math.max(0, node.scrollHeight - line)}px`;
  };
  useEffect(() => {
    if (inputRef.current) size(inputRef.current);
  }, [value, inputRef]);
  return (
    <div ref={box} className="relative">
      <span aria-hidden className="invisible block" style={fieldStyle()}>
        {"\u00a0"}
      </span>
      <textarea
        ref={inputRef}
        rows={1}
        value={value}
        maxLength={maxLength}
        aria-label={ariaLabel}
        placeholder={placeholder}
        className={`${PLAIN} absolute inset-x-0 top-0 resize-none overflow-hidden`}
        style={fieldStyle()}
        data-row-value={fieldId}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.defaultPrevented || event.key !== "Enter") return;
          if (singleLine || (maxLines && value.split("\n").length >= maxLines)) event.preventDefault();
        }}
        onChange={(event) => {
          onChange(event.target.value);
          size(event.target);
        }}
      />
    </div>
  );
}

/** A zone label typed in place. It wraps like the printed label; Enter ends the edit. */
function LabelField({
  value,
  placeholder,
  onChange,
  inputRef,
  hint = false,
  onKeyDown,
}: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  /** The placeholder is a hint, not a default label. */
  hint?: boolean;
}) {
  const own = useRef<HTMLTextAreaElement>(null);
  const ref = inputRef ?? own;
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, [value, ref]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      maxLength={INVITE_TITLE_MAX}
      aria-label={`${placeholder} label`}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value.replace(/\n/g, " "))}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      className={cn(LABEL_FIELD, hint ? "placeholder:text-[var(--placeholder)]" : "placeholder:text-[var(--grey)]")}
    />
  );
}

function CustomZone({
  row,
  focusTurn,
  onChange,
  onRemove,
}: {
  row: InviteRow;
  /** Each new turn puts the focus in the title. */
  focusTurn: number;
  onChange: (patch: Partial<InviteRow>) => void;
  /** Backspace in a row with nothing typed in either field. */
  onRemove: () => void;
}) {
  const removeIfEmpty = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Backspace" || row.title || row.value) return;
    event.preventDefault();
    onRemove();
  };
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const valueRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (focusTurn > 0) titleRef.current?.focus();
  }, [focusTurn]);
  return (
    <Zone
      label={
        <LabelField
          inputRef={titleRef}
          value={row.title}
          placeholder="title"
          hint
          onChange={(title) => onChange({ title })}
          onKeyDown={removeIfEmpty}
        />
      }
      rule
      onClick={(event) => focusField(event, valueRef.current)}
    >
      <GrowField
        inputRef={valueRef}
        value={row.value ?? ""}
        onChange={(value) => onChange({ value })}
        placeholder="description"
        ariaLabel={row.title || "Description"}
        maxLength={INVITE_VALUE_MAX}
        onKeyDown={removeIfEmpty}
        fieldId={row.id}
      />
    </Zone>
  );
}

function WhenField({
  inputRef,
  type,
  value,
  display,
  onChange,
  placeholder,
  width,
}: {
  inputRef?: RefObject<HTMLInputElement | null>;
  type: "date" | "time";
  value: string;
  display: string;
  onChange: (value: string) => void;
  placeholder: string;
  width: string;
}) {
  return (
    <span className="relative inline-flex items-baseline" style={{ width }}>
      <span
        className="pointer-events-none whitespace-nowrap"
        style={{ ...fieldStyle(), color: value ? "var(--ink)" : "var(--placeholder)" }}
      >
        {value ? display : placeholder}
      </span>
      <input
        ref={inputRef}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={placeholder}
        className="absolute inset-0 opacity-0"
        style={{ width, appearance: "none", WebkitAppearance: "none" }}
      />
    </span>
  );
}

function fmtDate(value: string): string {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year.slice(2)}`;
}

function timeZoneList(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [];
  }
}

export function EventForm({
  values,
  onChange,
  logoUrl,
  onLogoFile,
  onRemoveLogo,
  submitLabel,
  hint,
  saving,
  error,
  onSubmit,
}: {
  values: EventFormValues;
  onChange: (patch: Partial<EventFormValues>) => void;
  logoUrl: string | null;
  onLogoFile: (file: File) => void;
  onRemoveLogo?: () => void;
  /** Without `onSubmit` the form has no button of its own; the screen places one. */
  submitLabel?: string;
  hint?: string;
  saving?: boolean;
  error?: string | null;
  onSubmit?: () => void;
}) {
  const nameRef = useRef<HTMLTextAreaElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const placeRef = useRef<HTMLTextAreaElement>(null);
  const aboutRef = useRef<HTMLTextAreaElement>(null);
  const zoneRef = useRef<HTMLInputElement>(null);
  const [zones, setZones] = useState<string[]>([]);
  const [zoneText, setZoneText] = useState(values.timeZone);
  const [zoneShown, setZoneShown] = useState(values.timeZone);
  if (zoneShown !== values.timeZone) {
    setZoneShown(values.timeZone);
    setZoneText(values.timeZone);
  }
  const logoRef = useRef<HTMLInputElement>(null);
  const [focusRow, setFocusRow] = useState({ id: "", turn: 0 });

  const rows = values.inviteRows;
  const customs = customInviteRows(rows);

  const setWhen = (patch: Partial<Pick<EventFormValues, "date" | "time" | "endTime">>) => {
    const next = { ...values, ...patch };
    onChange({ ...patch, dateText: inviteDateText(next.date), timeText: inviteTimeText(next.time, next.endTime) });
  };

  const label = (kind: InviteBaseKind) => (
    <LabelField
      value={rows.find((row) => row.kind === kind)?.title ?? ""}
      placeholder={INVITE_BASE_LABELS[kind]}
      onChange={(title) => onChange({ inviteRows: withInviteLabel(rows, kind, title) })}
    />
  );

  const setCustom = (id: string, patch: Partial<InviteRow>) => {
    onChange({ inviteRows: rows.map((row) => (row.id === id ? { ...row, ...patch } : row)) });
  };

  const removeCustom = (id: string) => {
    const index = customs.findIndex((row) => row.id === id);
    const above = index > 0 ? customs[index - 1] : undefined;
    const field = above ? document.querySelector<HTMLTextAreaElement>(`[data-row-value="${CSS.escape(above.id)}"]`) : null;
    if (field) {
      field.focus();
      field.setSelectionRange(field.value.length, field.value.length);
    } else {
      (document.activeElement as HTMLElement | null)?.blur?.();
    }
    onChange({ inviteRows: rows.filter((row) => row.id !== id) });
  };

  const addCustom = () => {
    const blank = customs.find((row) => !row.title.trim() && !row.value?.trim());
    if (blank) {
      setFocusRow((current) => ({ id: blank.id, turn: current.turn + 1 }));
      return;
    }
    if (customs.length >= INVITE_CUSTOM_MAX) return;
    const row = newInviteRow();
    setFocusRow((current) => ({ id: row.id, turn: current.turn + 1 }));
    onChange({ inviteRows: [...rows, row] });
  };

  const pickLogo = async (file: File) => {
    onLogoFile(file);
    if (values.logoLook) return;
    if (await hasLightEdges(file)) onChange({ logoLook: "shadow" });
  };

  const removeLogo = () => {
    onChange({ logoLook: null });
    onRemoveLogo?.();
  };

  const cover = {
    name: values.layout === "card" ? values.name.trim() : values.name.trim() || "Event name",
    description: values.about.trim() || null,
    date: formStartIso(values),
    endDate: formEndIso(values),
    timeZone: values.timeZone,
    place: values.place.trim() || null,
    placeSecret: false,
    logoUrl,
    inviteRows: rows,
    logoLook: values.logoLook,
  };

  return (
    <>
      <Zone label={label("name")} rule onClick={(event) => focusField(event, nameRef.current)}>
        <GrowField
          inputRef={nameRef}
          value={values.name}
          onChange={(name) => onChange({ name: clampEventTitle(name) })}
          placeholder="Event title"
          ariaLabel="Title"
          maxLines={EVENT_TITLE_LINES}
        />
      </Zone>
      <Zone label={label("when")} rule onClick={(event) => focusField(event, dateRef.current)}>
        <div className="flex items-baseline">
          <WhenField
            inputRef={dateRef}
            type="date"
            value={values.date}
            display={fmtDate(values.date)}
            onChange={(date) => setWhen({ date })}
            placeholder="Date"
            width="8ch"
          />
          <div className="ml-6 flex items-baseline">
            <WhenField
              type="time"
              value={values.time}
              display={values.time}
              onChange={(time) => setWhen({ time })}
              placeholder="Start"
              width="5ch"
            />
            <span aria-hidden className="mx-2 text-[var(--grey)]" style={fieldStyle()}>
              –
            </span>
            <WhenField
              type="time"
              value={values.endTime}
              display={values.endTime}
              onChange={(endTime) => setWhen({ endTime })}
              placeholder="End"
              width="5ch"
            />
          </div>
          {values.date || values.time || values.endTime ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setWhen({ date: "", time: "", endTime: "" });
              }}
              className="press relative ml-auto border-0 bg-transparent p-0 t-meta text-[var(--grey)] [-webkit-tap-highlight-color:transparent]"
            >
              Reset
            </button>
          ) : null}
        </div>
      </Zone>
      <Zone label="Time zone" rule onClick={(event) => focusField(event, zoneRef.current)}>
        <input
          ref={zoneRef}
          value={zoneText}
          list="event-time-zones"
          aria-label="Time zone"
          placeholder="Europe/Lisbon"
          autoComplete="off"
          spellCheck={false}
          className={PLAIN}
          style={fieldStyle()}
          onFocus={() => {
            if (zones.length === 0) setZones(timeZoneList());
          }}
          onChange={(event) => {
            const next = event.target.value;
            setZoneText(next);
            if (isTimeZone(next.trim())) onChange({ timeZone: canonicalTimeZone(next.trim()) });
          }}
          onBlur={() => setZoneText(values.timeZone)}
        />
        <datalist id="event-time-zones">
          {zones.map((zone) => (
            <option key={zone} value={zone} />
          ))}
        </datalist>
      </Zone>
      <Zone label={label("place")} rule onClick={(event) => focusField(event, placeRef.current)}>
        <GrowField
          inputRef={placeRef}
          value={values.place}
          onChange={(place) => onChange({ place })}
          placeholder="Venue, address"
          ariaLabel="Place"
          singleLine
        />
      </Zone>
      <input
        ref={logoRef}
        type="file"
        accept={PIC_ACCEPT}
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 h-px w-px overflow-hidden opacity-0"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void pickLogo(file);
        }}
      />
      <Zone
        label={label("pic")}
        align="center"
        rule
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("input, textarea, button, [data-card-content]")) return;
          logoRef.current?.click();
        }}
      >
        <div className="flex items-center gap-[14px]">
          {logoUrl ? (
            <PhotoSlotPicker
              photo={logoUrl}
              onPhotoChange={(photo) => {
                if (!photo) removeLogo();
              }}
              onPick={() => logoRef.current?.click()}
              sizePx={48}
              borderRadiusPx={0}
              surfaceClassName=""
              photoLook={values.logoLook ?? undefined}
              onPhotoLook={(logoLook) => onChange({ logoLook })}
              lookOptions={LOGO_LOOKS}
            />
          ) : (
            <Plus className="size-7 shrink-0 text-hint" strokeWidth={1.5} aria-hidden />
          )}
          <span className="min-w-0">
            <p className="t-meta text-[var(--grey)]">{logoUrl ? "Tap to replace." : "PNG, JPG or SVG."}</p>
            {logoUrl && onRemoveLogo ? (
              <button
                type="button"
                onClick={removeLogo}
                className="press mt-1 border-0 bg-transparent p-0 t-meta text-[var(--grey)] [-webkit-tap-highlight-color:transparent]"
              >
                Remove
              </button>
            ) : null}
          </span>
        </div>
      </Zone>
      <Zone label={label("about")} rule onClick={(event) => focusField(event, aboutRef.current)}>
        <GrowField
          inputRef={aboutRef}
          value={values.about}
          onChange={(about) => onChange({ about })}
          placeholder="About the event"
          ariaLabel="About"
        />
      </Zone>
      {customs.map((row) => (
        <CustomZone
          key={row.id}
          row={row}
          focusTurn={focusRow.id === row.id ? focusRow.turn : 0}
          onChange={(patch) => setCustom(row.id, patch)}
          onRemove={() => removeCustom(row.id)}
        />
      ))}
      {customs.length < INVITE_CUSTOM_MAX ? (
        <Zone label={null} rule>
          <button
            type="button"
            aria-label="Add a row"
            onClick={addCustom}
            className="press flex border-0 bg-transparent p-0 text-[var(--ink)] [-webkit-tap-highlight-color:transparent]"
          >
            <MarkPlus />
          </button>
        </Zone>
      ) : null}
      <Zone label="Style" rule>
        <div className="flex flex-wrap gap-4">
          {EVENT_LAYOUTS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={values.layout === item.id}
              onClick={() =>
                onChange({ layout: item.id, ...(values.themeTouched ? {} : { theme: layoutDefaultTheme(item.id) }) })
              }
              className="press border-0 bg-transparent p-0 t-caps [-webkit-tap-highlight-color:transparent]"
              style={{ color: values.layout === item.id ? "var(--ink)" : "var(--grey)" }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </Zone>
      <Zone label={<span className="t-label block whitespace-nowrap pt-[5px]">Color</span>} align="start">
        <div
          className="grid items-start gap-2"
          style={{ gridTemplateColumns: `repeat(${EVENT_THEMES.length}, minmax(0, 1fr))`, maxWidth: EVENT_THEMES.length * 36 - 8 }}
        >
          {EVENT_THEMES.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-label={item.label}
              aria-pressed={values.theme === item.id}
              onClick={() => onChange({ theme: item.id, themeTouched: true })}
              className="press block w-full border-0 bg-transparent p-0 [-webkit-tap-highlight-color:transparent]"
            >
              <span
                className="block aspect-square w-full"
                style={{
                  background: `var(--event-theme-${item.id})`,
                  boxShadow: item.id === "paper" ? "inset 0 0 0 1px #999" : undefined,
                }}
              />
              <span className="mt-1 block h-px" style={{ background: values.theme === item.id ? "var(--ink)" : "transparent" }} />
            </button>
          ))}
        </div>
      </Zone>
      {onSubmit ? (
        <div className="pb-4" style={{ marginLeft: VALUE_AXIS_PX }}>
          <button type="button" disabled={!values.name.trim() || saving} onClick={onSubmit} className={SKY_BUTTON}>
            {submitLabel}
          </button>
          {hint ? <p className="mt-3 t-meta text-[var(--grey)]">{hint}</p> : null}
          {error ? <p className="mt-2 t-meta text-[var(--ink)]">{error}</p> : null}
        </div>
      ) : null}
      <div className="mt-8" style={{ marginLeft: VALUE_AXIS_PX, width: 150, paddingBottom: "max(2.5rem, env(safe-area-inset-bottom))" }}>
        <div className="border border-[#d4d4d4]">
          <CoverButton event={cover} layout={values.layout} themeId={values.theme} variant="card" />
        </div>
      </div>
    </>
  );
}
