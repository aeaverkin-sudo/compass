"use client";

import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type RefObject } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Zone } from "@/shared/components/zone";
import { MarkPlus } from "@/shared/components/mark-plus";
import { CoverButton } from "@/shared/event/cover-button";
import { EVENT_LAYOUTS, EVENT_THEMES, layoutDefaultTheme } from "@/shared/event/themes";
import { VALUE_AXIS_PX } from "@/shared/layout/axes";
import { hasLightEdges } from "@/shared/lib/photo-look";
import type { EventFormValues } from "@/shared/event/event-form-fields";
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
import { parseInviteDate, parseInviteTime, shapeInviteDate, shapeInviteTime } from "@/shared/event/invite-when";

export const PIC_ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg";

export type { EventFormValues };

const PLAIN = "w-full bg-transparent text-[var(--ink)] outline-none placeholder:text-[var(--placeholder)]";
const LABEL_FIELD =
  "t-label m-0 block w-full min-w-0 resize-none overflow-hidden border-0 bg-transparent p-0 outline-none";
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
  maxLength,
}: {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  singleLine?: boolean;
  maxLength?: number;
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
        onKeyDown={
          singleLine
            ? (event) => {
                if (event.key === "Enter") event.preventDefault();
              }
            : undefined
        }
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
}: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
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
  focusTitle,
  onChange,
}: {
  row: InviteRow;
  focusTitle: boolean;
  onChange: (patch: Partial<InviteRow>) => void;
}) {
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const valueRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (focusTitle) titleRef.current?.focus();
  }, [focusTitle]);
  return (
    <Zone
      label={
        <LabelField inputRef={titleRef} value={row.title} placeholder="title" hint onChange={(title) => onChange({ title })} />
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
      />
    </Zone>
  );
}

function previewDate(date: string, time: string): string | null {
  if (!date) return null;
  const when = new Date(`${date}T${time || "00:00"}`);
  return Number.isNaN(when.getTime()) ? null : when.toISOString();
}

function previewEnd(date: string, time: string, endTime: string): string | null {
  if (!date || !endTime) return null;
  const end = new Date(`${date}T${endTime}`);
  if (endTime <= (time || "00:00")) end.setDate(end.getDate() + 1);
  return Number.isNaN(end.getTime()) ? null : end.toISOString();
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
  submitLabel: string;
  hint: string;
  saving: boolean;
  error: string | null;
  onSubmit: () => void;
}) {
  const nameRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const placeRef = useRef<HTMLTextAreaElement>(null);
  const aboutRef = useRef<HTMLTextAreaElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const [addedRow, setAddedRow] = useState<string | null>(null);

  const rows = values.inviteRows;
  const customs = customInviteRows(rows);
  const dateWrong = values.dateText.trim().length > 0 && !parseInviteDate(values.dateText);
  const timeWrong = values.timeText.trim().length > 0 && !parseInviteTime(values.timeText);

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

  const addCustom = () => {
    if (customs.length >= INVITE_CUSTOM_MAX) return;
    const row = newInviteRow();
    setAddedRow(row.id);
    onChange({ inviteRows: [...rows, row] });
  };

  const pickLogo = async (file: File) => {
    onLogoFile(file);
    const light = await hasLightEdges(file);
    onChange({ logoLook: light ? "shadow" : null });
  };

  const cover = {
    name: values.layout === "card" ? values.name.trim() : values.name.trim() || "Event name",
    description: values.about.trim() || null,
    date: previewDate(values.date, values.time),
    endDate: previewEnd(values.date, values.time, values.endTime),
    place: values.place.trim() || null,
    placeSecret: false,
    logoUrl,
    inviteRows: rows,
    logoLook: values.logoLook,
    hints: true,
  };

  return (
    <>
      <Zone label={label("name")} rule onClick={(event) => focusField(event, nameRef.current)}>
        <input
          ref={nameRef}
          value={values.name}
          onChange={(event) => onChange({ name: event.target.value })}
          placeholder="Event name"
          className={PLAIN}
          style={fieldStyle()}
        />
      </Zone>
      <Zone label={label("when")} rule onClick={(event) => focusField(event, dateRef.current)}>
        <div className="flex items-baseline gap-6">
          <div className="shrink-0" style={{ width: "9ch" }}>
            <input
              ref={dateRef}
              value={values.dateText}
              inputMode="numeric"
              maxLength={10}
              aria-label="Date"
              placeholder="12.10.26"
              onChange={(event) => {
                const dateText = shapeInviteDate(event.target.value);
                onChange({ dateText, date: parseInviteDate(dateText) ?? "" });
              }}
              className={PLAIN}
              style={fieldStyle()}
            />
            {dateWrong ? <p className="m-0 mt-1 whitespace-nowrap t-meta text-[var(--grey)]">Use 12.10.26</p> : null}
          </div>
          <div className="min-w-0 flex-1">
            <input
              value={values.timeText}
              inputMode="numeric"
              maxLength={11}
              aria-label="Time"
              placeholder="15:30–20:30"
              onChange={(event) => {
                const timeText = shapeInviteTime(event.target.value);
                const parsed = parseInviteTime(timeText);
                onChange({ timeText, time: parsed?.start ?? "", endTime: parsed?.end ?? "" });
              }}
              className={PLAIN}
              style={fieldStyle()}
            />
            {timeWrong ? <p className="m-0 mt-1 whitespace-nowrap t-meta text-[var(--grey)]">Use 15:30–20:30</p> : null}
          </div>
        </div>
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
          if ((event.target as HTMLElement).closest("input, textarea, button")) return;
          logoRef.current?.click();
        }}
      >
        <div className="flex items-center gap-[14px]">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="size-12 object-contain" />
          ) : (
            <Plus className="size-7 shrink-0 text-hint" strokeWidth={1.5} aria-hidden />
          )}
          <span className="min-w-0">
            <p className="t-meta text-[var(--grey)]">{logoUrl ? "Tap to replace." : "PNG, JPG or SVG."}</p>
            {logoUrl && onRemoveLogo ? (
              <button
                type="button"
                onClick={() => {
                  onChange({ logoLook: null });
                  onRemoveLogo();
                }}
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
          focusTitle={addedRow === row.id}
          onChange={(patch) => setCustom(row.id, patch)}
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
      <div className="pb-4" style={{ marginLeft: VALUE_AXIS_PX }}>
        <button type="button" disabled={!values.name.trim() || saving} onClick={onSubmit} className={SKY_BUTTON}>
          {submitLabel}
        </button>
        {hint ? <p className="mt-3 t-meta text-[var(--grey)]">{hint}</p> : null}
        {error ? <p className="mt-2 t-meta text-[var(--ink)]">{error}</p> : null}
      </div>
      <div className="mt-8" style={{ marginLeft: VALUE_AXIS_PX, width: 150, paddingBottom: "max(2.5rem, env(safe-area-inset-bottom))" }}>
        <div className="border border-[#d4d4d4]">
          <CoverButton event={cover} layout={values.layout} themeId={values.theme} variant="card" />
        </div>
      </div>
    </>
  );
}
