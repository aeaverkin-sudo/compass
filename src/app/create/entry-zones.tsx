"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type RefObject } from "react";
import { nanoid } from "nanoid";
import { X } from "lucide-react";
import { MarkPlus } from "@/shared/components/mark-plus";
import { SectionNumber, sectionNumberLabel } from "@/shared/components/section-number";
import { useLongPress } from "@/shared/hooks/use-long-press";
import { openContactAttachmentPicker } from "@landing/components/photo-input-utils";
import { nextExtraZoneId } from "@/shared/services/card-zones";
import { detectAttachmentType, typeLabel } from "@/shared/services/portfolio-catalog";
import type { AttachmentContactType } from "@/shared/services/portfolio-limits";

const DELETE_RED = "#E23B2F";
const HOLD_MS = 900;
const NEW_HINT = "Contacts, location, etc.";

export type EntryRow = {
  key: string;
  value: string;
  file?: File;
  type?: AttachmentContactType;
};

export type EntryZone = {
  id: string;
  title: string;
  defaultTitle: string;
  custom: boolean;
  rows: EntryRow[];
};

const STARTERS: EntryZone[] = [
  { id: "position", title: "Position", defaultTitle: "Position", custom: false, rows: [] },
  { id: "web", title: "Web", defaultTitle: "Web", custom: false, rows: [] },
  { id: "social", title: "Social", defaultTitle: "Social", custom: false, rows: [] },
  { id: "files", title: "Files", defaultTitle: "Files", custom: false, rows: [] },
  { id: "about", title: "About", defaultTitle: "About", custom: false, rows: [] },
];

const HINTS: Record<string, string> = {
  position: "What you do",
  web: "Website",
  social: "Instagram, LinkedIn, etc.",
  files: "PDF, JPG, etc.",
  about: "A line about you",
};

export type EntryZonesHandle = { snapshot: () => EntryZone[] };

function fileMark(type: AttachmentContactType | undefined) {
  if (type === "photo") return "IMG";
  if (type === "pdf") return "PDF";
  return type ? typeLabel(type) : "File";
}

function blankCustom(zones: EntryZone[]) {
  return zones.find((zone) => zone.custom && !zone.title.trim() && zone.rows.length === 0) ?? null;
}

export const EntryZones = forwardRef<EntryZonesHandle>(function EntryZones(_, ref) {
  const [zones, setZones] = useState<EntryZone[]>(STARTERS);
  const [seedId, setSeedId] = useState<string | null>(null);
  const [seedText, setSeedText] = useState("");
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [titleId, setTitleId] = useState<string | null>(null);
  const [titleText, setTitleText] = useState("");
  const [armed, setArmed] = useState<string | null>(null);
  const zonesRef = useRef(zones);
  const titleRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const focusValue = useRef(false);
  zonesRef.current = zones;

  useImperativeHandle(ref, () => ({ snapshot: () => zonesRef.current }), []);

  useEffect(() => {
    if (!armed) return;
    const down = (event: PointerEvent) => {
      const node = event.target;
      if (node instanceof Element && node.closest("[data-entry-delete]")) return;
      setArmed(null);
    };
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }, [armed]);

  useEffect(() => {
    if (titleId) titleRef.current?.focus();
  }, [titleId]);

  useEffect(() => {
    if (!focusValue.current) return;
    focusValue.current = false;
    valueRef.current?.focus();
  }, [seedId, zones]);

  const commitSeed = (zoneId: string, text: string) => {
    const value = text.trim();
    setSeedId(null);
    setSeedText("");
    if (!value) {
      setZones((current) => dropEmptyCustom(current, zoneId));
      return;
    }
    setZones((current) =>
      current.map((zone) =>
        zone.id === zoneId ? { ...zone, rows: [...zone.rows, { key: nanoid(), value }] } : zone,
      ),
    );
  };

  const commitEdit = (key: string, text: string) => {
    const value = text.trim();
    setEditKey(null);
    setEditText("");
    setZones((current) =>
      current.map((zone) => ({
        ...zone,
        rows: value
          ? zone.rows.map((row) => (row.key === key ? { ...row, value } : row))
          : zone.rows.filter((row) => row.key !== key),
      })),
    );
  };

  const commitTitle = (zoneId: string, text: string) => {
    const zone = zonesRef.current.find((entry) => entry.id === zoneId);
    setTitleId(null);
    if (!zone) return;
    const next = text.trim();
    if (!next && !zone.custom) {
      setZones((current) =>
        current.map((entry) => (entry.id === zoneId ? { ...entry, title: entry.defaultTitle } : entry)),
      );
      return;
    }
    if (!next && zone.custom && zone.rows.length === 0 && seedId !== zoneId) {
      setZones((current) => current.filter((entry) => entry.id !== zoneId));
      return;
    }
    setZones((current) => current.map((entry) => (entry.id === zoneId ? { ...entry, title: next } : entry)));
  };

  const addZone = () => {
    const existing = blankCustom(zonesRef.current);
    if (existing) {
      setTitleId(existing.id);
      setTitleText("");
      setSeedId(existing.id);
      setSeedText("");
      return;
    }
    const id = nextExtraZoneId(zonesRef.current.map((zone) => zone.id));
    setZones((current) => [
      ...current,
      { id, title: "", defaultTitle: "", custom: true, rows: [] },
    ]);
    setTitleId(id);
    setTitleText("");
    setSeedId(id);
    setSeedText("");
  };

  const addFile = (zoneId: string) => {
    openContactAttachmentPicker((_dataUrl, file) => {
      if (!file) return;
      const type = detectAttachmentType(file);
      setZones((current) =>
        current.map((zone) =>
          zone.id === zoneId
            ? { ...zone, rows: [...zone.rows, { key: nanoid(), value: file.name, file, type }] }
            : zone,
        ),
      );
      setSeedId(null);
      setSeedText("");
    });
  };

  return (
    <div className="mt-[18px]">
      {zones.map((zone, index) => {
        const hint = zone.custom ? NEW_HINT : HINTS[zone.id];
        const about = zone.id === "about";
        const files = zone.id === "files" || zone.custom;
        const seeding = seedId === zone.id;
        return (
          <section key={zone.id} className="grid grid-cols-[86px_minmax(0,1fr)] items-start gap-x-[14px] border-b border-[var(--rule)] py-[18px]">
            <div className="min-w-0">
              <SectionNumber value={sectionNumberLabel(index)} />
              <div className="mt-[6px] flex items-start gap-2">
                {titleId === zone.id ? (
                  <input
                    ref={titleRef}
                    data-zone-title={zone.id}
                    value={titleText}
                    aria-label="Section title"
                    placeholder={zone.custom ? "TITLE" : undefined}
                    className="t-label m-0 w-full border-0 bg-transparent p-0 text-[var(--grey)] caret-[var(--ink)] outline-none placeholder:text-[var(--placeholder)]"
                    onChange={(event) => setTitleText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      commitTitle(zone.id, titleText);
                      setSeedId(zone.id);
                      focusValue.current = true;
                    }}
                    onBlur={() => commitTitle(zone.id, titleText)}
                  />
                ) : (
                  <TitleButton
                    title={zone.title}
                    placeholder={zone.custom && !zone.title.trim()}
                    onEdit={() => {
                      setTitleId(zone.id);
                      setTitleText(zone.title);
                      setArmed(null);
                    }}
                    onArm={() => setArmed(`title:${zone.id}`)}
                  />
                )}
                {armed === `title:${zone.id}` ? (
                  <button
                    type="button"
                    data-entry-delete=""
                    aria-label="Delete section"
                    className="border-0 bg-transparent p-0"
                    onClick={() => {
                      setZones((current) => current.filter((entry) => entry.id !== zone.id));
                      setArmed(null);
                    }}
                  >
                    <X className="size-4" strokeWidth={1.5} style={{ color: DELETE_RED }} aria-hidden />
                  </button>
                ) : null}
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-[10px]">
              {zone.rows.map((row) =>
                editKey === row.key ? (
                  <Field
                    key={row.key}
                    about={about}
                    value={editText}
                    placeholder=""
                    onChange={setEditText}
                    onCommit={() => commitEdit(row.key, editText)}
                  />
                ) : (
                  <RowButton
                    key={row.key}
                    text={row.type ? `${fileMark(row.type)} / ${row.value}` : row.value}
                    armed={armed === row.key}
                    onEdit={() => {
                      setEditKey(row.key);
                      setEditText(row.value);
                      setArmed(null);
                    }}
                    onArm={() => setArmed(row.key)}
                    onDelete={() => {
                      setZones((current) =>
                        current.map((entry) =>
                          entry.id === zone.id ? { ...entry, rows: entry.rows.filter((item) => item.key !== row.key) } : entry,
                        ),
                      );
                      setArmed(null);
                    }}
                  />
                ),
              )}
              {seeding ? (
                <div className="flex min-w-0 items-start gap-[11px]">
                  {files ? (
                    <button
                      type="button"
                      aria-label="Add file"
                      className="shrink-0 border-0 bg-transparent p-0 text-[var(--placeholder)]"
                      onPointerDown={(event) => event.preventDefault()}
                      onClick={() => addFile(zone.id)}
                    >
                      <MarkPlus className="text-[var(--placeholder)]" />
                    </button>
                  ) : null}
                  <Field
                    about={about}
                    value={seedText}
                    placeholder={hint}
                    inputRef={valueRef}
                    onChange={setSeedText}
                    onCommit={() => commitSeed(zone.id, seedText)}
                  />
                </div>
              ) : zone.rows.length === 0 ? (
                <button
                  type="button"
                  className="t-body border-0 bg-transparent p-0 text-left text-[var(--placeholder)]"
                  onClick={() => {
                    focusValue.current = true;
                    setSeedId(zone.id);
                    setSeedText("");
                  }}
                >
                  {hint}
                </button>
              ) : (
                <button
                  type="button"
                  aria-label="Add row"
                  className="border-0 bg-transparent p-0 text-left text-[var(--placeholder)]"
                  onClick={() => {
                    focusValue.current = true;
                    setSeedId(zone.id);
                    setSeedText("");
                  }}
                >
                  <MarkPlus className="text-[var(--placeholder)]" />
                </button>
              )}
            </div>
          </section>
        );
      })}
      <div className="grid grid-cols-[86px_minmax(0,1fr)] py-[18px]">
        <span />
        <button type="button" aria-label="Add section" className="border-0 bg-transparent p-0 text-left text-[var(--ink)]" onClick={addZone}>
          <MarkPlus />
        </button>
      </div>
    </div>
  );
});

function dropEmptyCustom(zones: EntryZone[], zoneId: string) {
  return zones.filter((zone) => !(zone.id === zoneId && zone.custom && !zone.title.trim() && zone.rows.length === 0));
}

function Field({
  about,
  value,
  placeholder,
  onChange,
  onCommit,
  inputRef,
}: {
  about: boolean;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  inputRef?: RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
}) {
  const className = "t-body m-0 w-full min-w-0 border-0 bg-transparent p-0 text-[var(--ink)] outline-none placeholder:text-[var(--placeholder)]";
  if (about) {
    return (
      <textarea
        ref={inputRef as RefObject<HTMLTextAreaElement>}
        value={value}
        rows={1}
        placeholder={placeholder}
        aria-label={placeholder || "About"}
        className={`${className} resize-none`}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onCommit}
      />
    );
  }
  return (
    <input
      ref={inputRef as RefObject<HTMLInputElement>}
      value={value}
      placeholder={placeholder}
      aria-label={placeholder || "Value"}
      className={className}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        onCommit();
      }}
      onBlur={onCommit}
    />
  );
}

function TitleButton({
  title,
  placeholder,
  onEdit,
  onArm,
}: {
  title: string;
  placeholder: boolean;
  onEdit: () => void;
  onArm: () => void;
}) {
  const press = useLongPress(onArm, HOLD_MS);
  return (
    <button
      type="button"
      className="t-label border-0 bg-transparent p-0 text-left text-[var(--grey)]"
      {...press}
      onClick={(event) => {
        press.onClick(event);
        if (!event.defaultPrevented) onEdit();
      }}
    >
      {placeholder ? <span className="text-[var(--placeholder)]">TITLE</span> : title}
    </button>
  );
}

function RowButton({
  text,
  armed,
  onEdit,
  onArm,
  onDelete,
}: {
  text: string;
  armed: boolean;
  onEdit: () => void;
  onArm: () => void;
  onDelete: () => void;
}) {
  const press = useLongPress(onArm, HOLD_MS);
  return (
    <div className="flex min-w-0 items-start gap-2">
      <button
        type="button"
        className="t-body min-w-0 flex-1 border-0 bg-transparent p-0 text-left text-[var(--ink)]"
        {...press}
        onClick={(event) => {
          press.onClick(event);
          if (!event.defaultPrevented) onEdit();
        }}
      >
        {text}
      </button>
      {armed ? (
        <button type="button" data-entry-delete="" aria-label="Delete row" className="shrink-0 border-0 bg-transparent p-0" onClick={onDelete}>
          <X className="size-4" strokeWidth={1.5} style={{ color: DELETE_RED }} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
