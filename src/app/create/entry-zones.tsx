"use client";

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { nanoid } from "nanoid";
import { X } from "lucide-react";
import { MarkPlus } from "@/shared/components/mark-plus";
import { SectionNumber, sectionNumberLabel } from "@/shared/components/section-number";
import { useLongPress } from "@/shared/hooks/use-long-press";
import { openContactAttachmentPicker } from "@landing/components/photo-input-utils";
import { isProseValue, labeledEntryLine, nextExtraZoneId, nextHeaderChoice, suggestedSectionTitle } from "@/shared/services/card-zones";
import { createEmptyContactItem, normalizeContactItem } from "@/shared/services/contact-item";
import type { QuestionnaireZone } from "@/shared/lib/fill-place";
import { detectAttachmentType } from "@/shared/services/portfolio-catalog";
import type { AttachmentContactType } from "@/shared/services/portfolio-limits";
import { WrapField, type WrapFieldHandle } from "@main/components/wrap-field";

const DELETE_RED = "#E23B2F";
const HOLD_MS = 900;
const NEW_HINT = "Skills, projects, experience, etc.";

export type EntryRow = {
  key: string;
  value: string;
  file?: File;
  type?: AttachmentContactType;
};

export type EntryZone = {
  id: string;
  title: string;
  custom: boolean;
  rows: EntryRow[];
};

const STARTERS: EntryZone[] = [
  { id: "position", title: "Position", custom: false, rows: [] },
  { id: "company", title: "Company", custom: false, rows: [] },
  { id: "web", title: "Web", custom: false, rows: [] },
  { id: "social", title: "Social", custom: false, rows: [] },
  { id: "files", title: "Files", custom: false, rows: [] },
  { id: "about", title: "About", custom: false, rows: [] },
  { id: "contact", title: "Contacts", custom: false, rows: [] },
];

const HINTS: Record<string, string> = {
  position: "What you do",
  company: "Company. Business name",
  web: "Website",
  social: "Instagram, LinkedIn, etc.",
  files: "PDF, JPG, etc.",
  about: "A line about you",
  contact: "Phone, messenger, mail",
};

export type EntryZonesHandle = {
  snapshot: () => EntryZone[];
  headerKey: () => string | null;
  place: () => {
    zones: QuestionnaireZone[];
    headerKey: string | null;
    editKey: string | null;
    editText: string;
    seedId: string | null;
    seedText: string;
  };
  restore: (place: {
    zones: QuestionnaireZone[];
    headerKey: string | null;
    editKey: string | null;
    editText: string;
    seedId: string | null;
    seedText: string;
  }) => void;
};

type EntryZonesProps = {
  onChange?: () => void;
};

function blankCustom(zones: EntryZone[]) {
  return zones.find((zone) => zone.custom && !zone.title.trim() && zone.rows.length === 0) ?? null;
}

function storedLine(value: string) {
  return normalizeContactItem(createEmptyContactItem(0), value).value;
}

function lineOf(row: EntryRow) {
  return labeledEntryLine(row.value, row.type);
}

function titled(zone: EntryZone, value: string, fileType?: AttachmentContactType | null): EntryZone {
  if (zone.title.trim()) return zone;
  const title = suggestedSectionTitle(value, fileType);
  return title ? { ...zone, title } : zone;
}

export const EntryZones = forwardRef<EntryZonesHandle, EntryZonesProps>(function EntryZones({ onChange }, ref) {
  const [zones, setZones] = useState<EntryZone[]>(STARTERS);
  const [seedId, setSeedId] = useState<string | null>(null);
  const [seedText, setSeedText] = useState("");
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [titleId, setTitleId] = useState<string | null>(null);
  const [titleText, setTitleText] = useState("");
  const [armed, setArmed] = useState<string | null>(null);
  const [headerKey, setHeaderKey] = useState<string | null>(null);
  const zonesRef = useRef(zones);
  const headerRef = useRef<string | null>(null);
  const editKeyRef = useRef<string | null>(null);
  const editTextRef = useRef("");
  const seedIdRef = useRef<string | null>(null);
  const seedTextRef = useRef("");
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const valueRef = useRef<WrapFieldHandle>(null);
  const focusValue = useRef(false);
  const onChangeRef = useRef(onChange);
  zonesRef.current = zones;
  editKeyRef.current = editKey;
  editTextRef.current = editText;
  seedIdRef.current = seedId;
  seedTextRef.current = seedText;
  onChangeRef.current = onChange;

  const rememberHeader = (key: string | null) => {
    headerRef.current = key;
    setHeaderKey(key);
  };

  useImperativeHandle(
    ref,
    () => ({
      snapshot: () => zonesRef.current,
      headerKey: () => headerRef.current,
      place: () => ({
        zones: zonesRef.current.map((zone) => ({
          id: zone.id,
          title: zone.title,
          custom: zone.custom,
          rows: zone.rows.map((row) => ({ key: row.key, value: row.value, ...(row.type ? { type: row.type } : {}) })),
        })),
        headerKey: headerRef.current,
        editKey: editKeyRef.current,
        editText: editTextRef.current,
        seedId: seedIdRef.current,
        seedText: seedTextRef.current,
      }),
      restore: (place) => {
        const zones = place.zones.map((zone) => ({
          id: zone.id,
          title: zone.title,
          custom: zone.custom,
          rows: zone.rows.map((row) => ({
            key: row.key,
            value: row.value,
            ...(row.type ? { type: row.type as AttachmentContactType } : {}),
          })),
        }));
        zonesRef.current = zones;
        setZones(zones);
        rememberHeader(place.headerKey);
        setEditKey(place.editKey);
        setEditText(place.editText);
        setSeedId(place.seedId);
        setSeedText(place.seedText);
        if (place.editKey || place.seedId) focusValue.current = true;
      },
    }),
    [],
  );

  useEffect(() => {
    onChangeRef.current?.();
  }, [zones, editKey, editText, seedId, seedText, headerKey]);

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

  useLayoutEffect(() => {
    const node = titleRef.current;
    if (!titleId || !node) return;
    node.style.height = "0px";
    node.style.height = `${node.scrollHeight}px`;
    node.focus();
  }, [titleId, titleText]);

  useEffect(() => {
    if (!focusValue.current) return;
    focusValue.current = false;
    valueRef.current?.focusEnd();
  }, [seedId, zones]);

  const discardEmpty = (zoneId: string) => {
    setSeedId(null);
    setSeedText("");
    setZones((current) => current.filter((zone) => !(zone.id === zoneId && !zone.title.trim() && zone.rows.length === 0)));
  };

  const releaseHeader = (key: string) => {
    if (headerRef.current !== key) return;
    rememberHeader(null);
  };

  const discardRow = (zoneId: string, key: string) => {
    releaseHeader(key);
    setEditKey(null);
    setEditText("");
    setZones((current) =>
      current.flatMap((zone) => {
        if (zone.id !== zoneId) return [zone];
        const rows = zone.rows.filter((row) => row.key !== key);
        if (!zone.title.trim() && rows.length === 0) return [];
        return [{ ...zone, rows }];
      }),
    );
  };

  const commitSeed = (zoneId: string, text: string) => {
    const typed = text.trim();
    const value = typed ? storedLine(typed) : "";
    setSeedId(null);
    setSeedText("");
    if (!value) return;
    setZones((current) =>
      current.map((zone) =>
        zone.id === zoneId ? { ...titled(zone, value), rows: [...zone.rows, { key: nanoid(), value }] } : zone,
      ),
    );
  };

  const commitEdit = (key: string, text: string) => {
    const typed = text.trim();
    const value = typed ? storedLine(typed) : "";
    if (!value) releaseHeader(key);
    setEditKey(null);
    setEditText("");
    setZones((current) =>
      current.map((zone) => {
        const rows = value
          ? zone.rows.map((row) => (row.key === key ? { ...row, value } : row))
          : zone.rows.filter((row) => row.key !== key);
        const next = value && rows.some((row) => row.key === key) ? titled({ ...zone, rows }, value) : { ...zone, rows };
        return next;
      }),
    );
  };

  const commitTitle = (zoneId: string, text: string) => {
    const zone = zonesRef.current.find((entry) => entry.id === zoneId);
    setTitleId(null);
    if (!zone) return;
    const next = text.trim();
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
      { id, title: "", custom: true, rows: [] },
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
            ? {
                ...titled(zone, file.name, type),
                rows: [...zone.rows, { key: nanoid(), value: file.name, file, type }],
              }
            : zone,
        ),
      );
      setSeedId(null);
      setSeedText("");
    });
  };

  const cycleZone = (zone: EntryZone) => {
    const rows = zone.rows.flatMap((row) =>
      row.value.trim() && !isProseValue(row.value) ? [{ id: row.key, value: row.value }] : [],
    );
    rememberHeader(nextHeaderChoice(headerRef.current ?? undefined, rows).id ?? null);
  };

  return (
    <div className="mt-[18px]">
      {zones.map((zone, index) => {
        const hint = zone.custom ? NEW_HINT : HINTS[zone.id];
        const about = zone.id === "about";
        const files = zone.id === "files" || zone.custom;
        const seeding = seedId === zone.id;
        const promotable = zone.id === "position" || zone.id === "company";
        return (
          <section key={zone.id} className="grid grid-cols-[86px_minmax(0,1fr)] items-start gap-x-[14px] border-b border-[var(--rule)] py-[18px]">
            <div className="min-w-0">
              <ZoneDigit
                index={index}
                custom={zone.custom}
                armed={armed === `digit:${zone.id}`}
                onArm={() => setArmed(`digit:${zone.id}`)}
                onDelete={() => {
                  if (zone.rows.some((row) => row.key === headerRef.current)) rememberHeader(null);
                  setZones((current) => current.filter((entry) => entry.id !== zone.id));
                  setArmed(null);
                }}
              />
              <div className="mt-[6px] flex min-w-0 items-start gap-2">
                {titleId === zone.id && zone.custom ? (
                  <textarea
                    ref={titleRef}
                    data-zone-title={zone.id}
                    value={titleText}
                    rows={1}
                    wrap="soft"
                    aria-label="Section title"
                    placeholder="Section name"
                    className="t-label m-0 min-w-0 flex-1 resize-none overflow-hidden border-0 bg-transparent p-0 whitespace-pre-wrap break-normal text-[var(--grey)] caret-[var(--ink)] outline-none placeholder:text-[var(--grey)]"
                    onChange={(event) => setTitleText(event.target.value.replace(/[ \t]*\n[ \t]*/g, " "))}
                    onKeyDown={(event) => {
                      if (
                        (event.key === "Backspace" || event.key === "Delete") &&
                        !titleText &&
                        zone.rows.length === 0 &&
                        (seedId !== zone.id || !seedText)
                      ) {
                        event.preventDefault();
                        setTitleId(null);
                        setSeedId((current) => (current === zone.id ? null : current));
                        setSeedText("");
                        setZones((current) => current.filter((entry) => entry.id !== zone.id));
                        return;
                      }
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      commitTitle(zone.id, titleText);
                      setSeedId(zone.id);
                      focusValue.current = true;
                    }}
                    onBlur={() => {
                      if (!zonesRef.current.some((entry) => entry.id === zone.id)) return;
                      commitTitle(zone.id, titleText);
                    }}
                  />
                ) : promotable ? (
                  <button
                    type="button"
                    className="t-label block min-w-0 flex-1 border-0 bg-transparent p-0 text-left whitespace-normal break-normal text-[var(--grey)]"
                    onClick={() => cycleZone(zone)}
                  >
                    {zone.title}
                  </button>
                ) : zone.custom ? (
                  <TitleButton
                    title={zone.title}
                    placeholder={!zone.title.trim()}
                    onEdit={() => {
                      setTitleId(zone.id);
                      setTitleText(zone.title);
                      setArmed(null);
                    }}
                  />
                ) : (
                  <span className="t-label block min-w-0 flex-1 text-left whitespace-normal break-normal text-[var(--grey)]">{zone.title}</span>
                )}
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
                    onCommit={(text) => commitEdit(row.key, text)}
                    onDiscardEmpty={() => discardRow(zone.id, row.key)}
                  />
                ) : (
                  <RowButton
                    key={row.key}
                    text={lineOf(row)}
                    armed={armed === row.key}
                    onPick={
                      promotable && !isProseValue(row.value)
                        ? () => rememberHeader(headerKey === row.key ? null : row.key)
                        : undefined
                    }
                    onEdit={() => {
                      setEditKey(row.key);
                      setEditText(row.value);
                      setArmed(null);
                    }}
                    onArm={() => setArmed(row.key)}
                    onDelete={() => {
                      releaseHeader(row.key);
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
                      className="shrink-0 border-0 bg-transparent p-0 text-[var(--ink)]"
                      onPointerDown={(event) => event.preventDefault()}
                      onClick={() => addFile(zone.id)}
                    >
                      <MarkPlus className="text-[var(--ink)]" />
                    </button>
                  ) : null}
                  <Field
                    about={about}
                    value={seedText}
                    placeholder={zone.rows.length === 0 ? hint : ""}
                    roomy={zone.rows.length === 0}
                    inputRef={valueRef}
                    onChange={setSeedText}
                    onCommit={(text) => commitSeed(zone.id, text)}
                    onDiscardEmpty={() => discardEmpty(zone.id)}
                  />
                </div>
              ) : zone.rows.length === 0 ? (
                <button
                  type="button"
                  className="t-body min-h-11 w-full border-0 bg-transparent p-0 text-left text-[var(--placeholder)]"
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
                  className="border-0 bg-transparent p-0 text-left text-[var(--ink)]"
                  onClick={() => {
                    focusValue.current = true;
                    setSeedId(zone.id);
                    setSeedText("");
                  }}
                >
                  <MarkPlus className="text-[var(--ink)]" />
                </button>
              )}
            </div>
          </section>
        );
      })}
      <div className="grid grid-cols-[86px_minmax(0,1fr)] gap-x-[14px] py-[18px]">
        <span />
        <button type="button" aria-label="Add section" className="border-0 bg-transparent p-0 text-left text-[var(--ink)]" onClick={addZone}>
          <MarkPlus />
        </button>
      </div>
    </div>
  );
});

function Field({
  about,
  value,
  placeholder,
  roomy = false,
  onChange,
  onCommit,
  onDiscardEmpty,
  inputRef,
}: {
  about: boolean;
  value: string;
  placeholder?: string;
  roomy?: boolean;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
  onDiscardEmpty?: () => void;
  inputRef?: RefObject<WrapFieldHandle | null>;
}) {
  const done = useRef(false);
  const finish = (text: string) => {
    if (done.current) return;
    done.current = true;
    onCommit(text);
  };
  const discard = () => {
    if (done.current) return;
    done.current = true;
    if (onDiscardEmpty) onDiscardEmpty();
    else onCommit("");
  };
  return (
    <WrapField
      ref={inputRef}
      initial={value}
      label={placeholder || (about ? "About" : "Value")}
      placeholder={placeholder}
      multiline={about}
      breakButton={false}
      onTextChange={onChange}
      onDone={finish}
      onEmptyDelete={discard}
      onBlur={(text) => finish(text)}
      placeholderClassName="t-body text-[var(--placeholder)]"
      className={cn("t-body bg-transparent text-[var(--ink)] caret-[var(--ink)]", roomy && "min-h-11")}
    />
  );
}

function ZoneDigit({
  index,
  custom,
  armed,
  onArm,
  onDelete,
}: {
  index: number;
  custom: boolean;
  armed: boolean;
  onArm: () => void;
  onDelete: () => void;
}) {
  const press = useLongPress(onArm, HOLD_MS);
  if (!custom) return <SectionNumber value={sectionNumberLabel(index)} />;
  return (
    <div className="flex items-start gap-1">
      <button type="button" className="border-0 bg-transparent p-0" {...press}>
        <SectionNumber value={sectionNumberLabel(index)} />
      </button>
      {armed ? (
        <button type="button" data-entry-delete="" aria-label="Delete section" className="border-0 bg-transparent p-0" onClick={onDelete}>
          <X className="size-4" strokeWidth={1.5} style={{ color: DELETE_RED }} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

function TitleButton({
  title,
  placeholder,
  onEdit,
}: {
  title: string;
  placeholder: boolean;
  onEdit: () => void;
}) {
  return (
    <button
      type="button"
      className="t-label block min-w-0 flex-1 border-0 bg-transparent p-0 text-left whitespace-normal break-normal text-[var(--grey)]"
      onClick={onEdit}
    >
      {placeholder ? "Section name" : title}
    </button>
  );
}

function RowButton({
  text,
  armed,
  onPick,
  onEdit,
  onArm,
  onDelete,
}: {
  text: string;
  armed: boolean;
  onPick?: () => void;
  onEdit: () => void;
  onArm: () => void;
  onDelete: () => void;
}) {
  const press = useLongPress(onArm, HOLD_MS);
  return (
    <div className="flex min-w-0 items-start gap-2">
      <button
        type="button"
        className="t-body min-w-0 flex-1 border-0 bg-transparent p-0 text-left text-[var(--ink)] whitespace-pre-wrap break-words"
        {...press}
        onClick={(event) => {
          press.onClick(event);
          if (event.defaultPrevented) return;
          onPick?.();
          onEdit();
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
