"use client";

import { useEffect, useRef, useState, type MouseEvent, type RefObject } from "react";
import { Plus } from "lucide-react";
import { Zone } from "@/shared/components/zone";
import { InviteCover } from "@/shared/event/invite-cover";
import { EVENT_LAYOUTS, EVENT_THEMES, layoutDefaultTheme } from "@/shared/event/themes";
import { VALUE_AXIS_PX } from "@/shared/layout/axes";
import type { EventFormValues } from "@/shared/event/event-form-fields";

export const PIC_ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg";

export type { EventFormValues };

const PLAIN = "w-full bg-transparent text-[var(--ink)] outline-none placeholder:text-[var(--placeholder)]";
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

function PlainField({
  inputRef,
  value,
  onChange,
  placeholder,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={PLAIN}
      style={fieldStyle()}
    />
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
  inputRef: RefObject<HTMLInputElement | null>;
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

function previewDate(date: string, time: string): string | null {
  if (!date) return null;
  const when = new Date(`${date}T${time || "00:00"}`);
  return Number.isNaN(when.getTime()) ? null : when.toISOString();
}

function previewEnd(date: string, endTime: string): string | null {
  if (!date || !endTime) return null;
  const end = new Date(`${date}T${endTime}`);
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
  const [previewOpen, setPreviewOpen] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);
  const placeRef = useRef<HTMLInputElement>(null);
  const aboutRef = useRef<HTMLTextAreaElement>(null);
  const aboutBox = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  const sizeAbout = (node: HTMLTextAreaElement) => {
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
    const box = aboutBox.current;
    if (!box) return;
    const line = parseFloat(getComputedStyle(node).lineHeight) || 23;
    box.style.marginBottom = `${Math.max(0, node.scrollHeight - line)}px`;
  };

  useEffect(() => {
    if (aboutRef.current) sizeAbout(aboutRef.current);
  }, [values.about]);

  const cover = {
    name: values.name.trim() || "Event name",
    description: values.about.trim() || null,
    date: previewDate(values.date, values.time),
    endDate: previewEnd(values.date, values.endTime),
    place: values.place.trim() || null,
    placeSecret: false,
    logoUrl,
  };

  return (
    <>
      <Zone label="Name" rule onClick={(event) => focusField(event, nameRef.current)}>
        <PlainField inputRef={nameRef} value={values.name} onChange={(name) => onChange({ name })} placeholder="Event name" />
      </Zone>
      <Zone label="When" rule onClick={(event) => focusField(event, dateRef.current)}>
        <div className="flex items-baseline">
          <WhenField
            inputRef={dateRef}
            type="date"
            value={values.date}
            display={fmtDate(values.date)}
            onChange={(date) => onChange({ date })}
            placeholder="Date"
            width="8ch"
          />
          <div className="ml-6 flex items-baseline">
            <WhenField
              inputRef={timeRef}
              type="time"
              value={values.time}
              display={values.time}
              onChange={(time) => onChange({ time })}
              placeholder="Start"
              width="5ch"
            />
            <span aria-hidden className="mx-2 text-[var(--grey)]" style={fieldStyle()}>
              –
            </span>
            <WhenField
              inputRef={endRef}
              type="time"
              value={values.endTime}
              display={values.endTime}
              onChange={(endTime) => onChange({ endTime })}
              placeholder="End"
              width="5ch"
            />
          </div>
        </div>
      </Zone>
      <Zone label="Place" rule onClick={(event) => focusField(event, placeRef.current)}>
        <PlainField inputRef={placeRef} value={values.place} onChange={(place) => onChange({ place })} placeholder="Venue, address" />
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
          if (file) onLogoFile(file);
        }}
      />
      <Zone
        label="Pic"
        align="center"
        rule
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("input, button")) return;
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
                onClick={onRemoveLogo}
                className="press mt-1 border-0 bg-transparent p-0 t-meta text-[var(--grey)] [-webkit-tap-highlight-color:transparent]"
              >
                Remove
              </button>
            ) : null}
          </span>
        </div>
      </Zone>
      <Zone label="About" rule onClick={(event) => focusField(event, aboutRef.current)}>
        <div ref={aboutBox} className="relative">
          <span aria-hidden className="invisible block" style={fieldStyle()}>
            {"\u00a0"}
          </span>
          <textarea
            ref={aboutRef}
            rows={1}
            value={values.about}
            aria-label="About"
            className={`${PLAIN} absolute inset-x-0 top-0 resize-none overflow-hidden`}
            style={fieldStyle()}
            onChange={(event) => {
              onChange({ about: event.target.value });
              sizeAbout(event.target);
            }}
          />
        </div>
      </Zone>
      <Zone label="Style" rule>
        <div className="flex flex-wrap gap-4">
          {EVENT_LAYOUTS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={values.layout === item.id}
              onClick={() =>
                onChange({
                  layout: item.id,
                  ...(values.themeTouched ? {} : { theme: layoutDefaultTheme(item.id) }),
                })
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
        <div className="grid grid-cols-6 items-start gap-2" style={{ maxWidth: 6 * 28 + 5 * 8 }}>
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
      <button
        type="button"
        onClick={() => setPreviewOpen(true)}
        className="press mt-8 block border-0 bg-transparent p-0 text-left [-webkit-tap-highlight-color:transparent]"
        style={{ marginLeft: VALUE_AXIS_PX, width: 150, paddingBottom: "max(2.5rem, env(safe-area-inset-bottom))" }}
      >
        <InviteCover variant="card" layout={values.layout} themeId={values.theme} event={cover} />
      </button>
      {previewOpen ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Close preview"
          onClick={() => setPreviewOpen(false)}
          onKeyDown={(event) => {
            if (event.key === "Escape" || event.key === "Enter") setPreviewOpen(false);
          }}
          className="fixed inset-0 z-[80] overflow-y-auto [-webkit-tap-highlight-color:transparent]"
          style={{ background: `var(--event-theme-${values.theme})`, color: `var(--event-theme-${values.theme}-ink)` }}
        >
          <InviteCover variant="page" layout={values.layout} themeId={values.theme} event={cover} />
        </div>
      ) : null}
    </>
  );
}
