"use client";

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { nanoid } from "nanoid";
import { ChevronDown, X } from "lucide-react";
import { MarkPlus } from "@/shared/components/mark-plus";
import { SectionNumber, sectionNumberLabel } from "@/shared/components/section-number";
import { useLongPress } from "@/shared/hooks/use-long-press";
import { openContactAttachmentPicker } from "@landing/components/photo-input-utils";
import { isProseValue, labeledEntryLine, nextExtraZoneId, nextHeaderChoice, suggestedSectionTitle } from "@/shared/services/card-zones";
import { createEmptyContactItem, detectContactType, normalizeContactItem } from "@/shared/services/contact-item";
import type { QuestionnaireZone } from "@/shared/lib/fill-place";
import { detectAttachmentType } from "@/shared/services/portfolio-catalog";
import type { AttachmentContactType } from "@/shared/services/portfolio-limits";
import { WrapField, type WrapFieldHandle } from "@main/components/wrap-field";

const DELETE_RED = "#E23B2F";
/** A value Create refused. Same red as the row delete mark. */
export const ENTRY_MARK = DELETE_RED;
const LINK_WORD = /^(?:https?:\/\/)?(?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?$/i;
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

const FIRST = ["position", "company", "contact"] as const;
const FOLDED = ["web", "social", "files", "about"] as const;
const REQUIRED = new Set<string>(["position", "company", "contact"]);

const HINTS: Record<string, string> = {
  position: "What you do",
  company: "Company. Business name",
  web: "Website",
  social: "Link — Instagram, LinkedIn, etc.",
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
  /** Paints refused values and returns the first one. `seed:` is an open line. */
  markProblems: () => string | null;
  /** Position, Company, and Contacts each have something typed. */
  requiredFilled: () => boolean;
};

type EntryZonesProps = {
  onChange?: () => void;
};

function blankCustom(zones: EntryZone[]) {
  return zones.find((zone) => zone.custom && !zone.title.trim() && zone.rows.length === 0) ?? null;
}

function storedLine(value: string, zoneId?: string) {
  return normalizeContactItem(createEmptyContactItem(0), value, zoneId).value;
}

function lineOf(row: EntryRow, zoneId: string) {
  return labeledEntryLine(row.value, row.type, zoneId);
}

/** Social and Web: a line that stayed plain text. Contacts: a broken mail or a link split by a space. */
function zoneHasText(
  zone: EntryZone,
  seedZone: string | null,
  seedText: string,
  editKey: string | null,
  editText: string,
) {
  if (seedZone === zone.id && seedText.trim()) return true;
  return zone.rows.some((row) => (editKey === row.key ? editText : row.value).trim().length > 0);
}

function entryLineIsRed(zoneId: string, raw: string) {
  const line = raw.trim();
  if (!line) return false;
  if (zoneId !== "social" && zoneId !== "web" && zoneId !== "contact") return false;
  if (zoneId === "social" || zoneId === "web") return detectContactType(line, zoneId) === "text";
  if (detectContactType(line, "contact") !== "text") return false;
  if (line.includes("@")) return true;
  return line.split(/\s+/).some((part) => LINK_WORD.test(part.replace(/^[("']+|[),"'.:]+$/g, "")));
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
  const [marked, setMarked] = useState<ReadonlySet<string>>(() => new Set());
  const [seedMarked, setSeedMarked] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const zonesRef = useRef(zones);
  const headerRef = useRef<string | null>(null);
  const editKeyRef = useRef<string | null>(null);
  const editTextRef = useRef("");
  const seedIdRef = useRef<string | null>(null);
  const seedTextRef = useRef("");
  const moreOpenRef = useRef(false);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const valueRef = useRef<WrapFieldHandle>(null);
  const focusValue = useRef(false);
  const onChangeRef = useRef(onChange);
  zonesRef.current = zones;
  editKeyRef.current = editKey;
  editTextRef.current = editText;
  seedIdRef.current = seedId;
  seedTextRef.current = seedText;
  moreOpenRef.current = moreOpen;
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
      markProblems: () => {
        const bad: string[] = [];
        let first: string | null = null;
        for (const zone of zonesRef.current) {
          for (const row of zone.rows) {
            if (row.type) continue;
            const value = editKeyRef.current === row.key ? editTextRef.current : row.value;
            if (!entryLineIsRed(zone.id, value)) continue;
            bad.push(row.key);
            if (!first) first = row.key;
          }
        }
        const seedZone = seedIdRef.current;
        const seedBad = Boolean(seedZone && entryLineIsRed(seedZone, seedTextRef.current));
        if (seedBad && seedZone && !first) first = `seed:${seedZone}`;
        setMarked(new Set(bad));
        setSeedMarked(seedBad);
        if (first && !moreOpenRef.current) {
          const zoneId = first.startsWith("seed:")
            ? first.slice(5)
            : zonesRef.current.find((zone) => zone.rows.some((row) => row.key === first))?.id;
          const zone = zonesRef.current.find((entry) => entry.id === zoneId);
          if (zone && (zone.custom || (FOLDED as readonly string[]).includes(zone.id))) setMoreOpen(true);
        }
        return first;
      },
      requiredFilled: () =>
        FIRST.every((id) => {
          const zone = zonesRef.current.find((entry) => entry.id === id);
          if (!zone) return false;
          return zoneHasText(zone, seedIdRef.current, seedTextRef.current, editKeyRef.current, editTextRef.current);
        }),
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
    const value = typed ? storedLine(typed, zoneId) : "";
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
    const zoneId = zonesRef.current.find((zone) => zone.rows.some((row) => row.key === key))?.id;
    const value = typed ? storedLine(typed, zoneId) : "";
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

  const pick = (ids: readonly string[]) =>
    ids.flatMap((id) => {
      const zone = zones.find((entry) => entry.id === id);
      return zone ? [zone] : [];
    });
  const head = pick(FIRST);
  const tail = [...pick(FOLDED), ...zones.filter((zone) => zone.custom)];
  const section = (zone: EntryZone, index: number) => {
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
                    placeholder="Title"
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
                  <div key={row.key} data-entry-row={row.key} className="min-w-0">
                    <Field
                      about={about}
                      value={editText}
                      placeholder=""
                      marked={marked.has(row.key)}
                      onChange={setEditText}
                      onCommit={(text) => commitEdit(row.key, text)}
                      onDiscardEmpty={() => discardRow(zone.id, row.key)}
                    />
                  </div>
                ) : (
                  <RowButton
                    key={row.key}
                    rowKey={row.key}
                    text={lineOf(row, zone.id)}
                    marked={marked.has(row.key)}
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
                <div data-entry-seed={zone.id} className="flex min-w-0 items-start gap-[11px]">
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
                  <div className="relative min-w-0 flex-1">
                    {zone.rows.length === 0 && !seedText.trim() ? (
                      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 t-body text-[var(--placeholder)]">
                        <HintLine text={hint} star={REQUIRED.has(zone.id)} />
                      </span>
                    ) : null}
                    <Field
                      about={about}
                      value={seedText}
                      placeholder=""
                      roomy={zone.rows.length === 0}
                      marked={seedMarked}
                      inputRef={valueRef}
                      onChange={setSeedText}
                      onCommit={(text) => commitSeed(zone.id, text)}
                      onDiscardEmpty={() => discardEmpty(zone.id)}
                    />
                  </div>
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
                  <HintLine text={hint} star={REQUIRED.has(zone.id)} />
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
  };

  return (
    <div className="mt-[18px]">
      {head.map(section)}
      <MoreRow open={moreOpen} onToggle={() => setMoreOpen((current) => !current)} />
      {moreOpen ? tail.map((zone, index) => section(zone, head.length + index)) : null}
      {moreOpen ? (
        <div className="grid grid-cols-[86px_minmax(0,1fr)] gap-x-[14px] py-[18px]">
          <span />
          <button type="button" aria-label="Add section" className="border-0 bg-transparent p-0 text-left text-[var(--ink)]" onClick={addZone}>
            <MarkPlus />
          </button>
        </div>
      ) : null}
    </div>
  );
});

function HintLine({ text, star }: { text: string; star: boolean }) {
  return (
    <>
      {text}
      {star ? <span className="relative -top-[0.35em] ml-[0.15em] leading-none text-[var(--ink)]">*</span> : null}
    </>
  );
}

function MoreRow({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const label = open ? "More" : "More — Web · Social · Files · About";
  const chevron = (
    <ChevronDown
      className={cn("size-4 shrink-0 text-[var(--ink)]", open && "rotate-180")}
      strokeWidth={1.5}
      aria-hidden
    />
  );
  const button = (
    <button
      type="button"
      aria-expanded={open}
      className="flex w-full min-w-0 items-center justify-between gap-3 border-0 bg-transparent p-0"
      onClick={onToggle}
    >
      <span className="t-label min-w-0 whitespace-nowrap">{label}</span>
      {chevron}
    </button>
  );
  if (!open) return <div className="py-[18px]">{button}</div>;
  return (
    <div className="grid grid-cols-[86px_minmax(0,1fr)] gap-x-[14px] py-[18px]">
      <span />
      {button}
    </div>
  );
}

function Field({
  about,
  value,
  placeholder,
  roomy = false,
  marked = false,
  onChange,
  onCommit,
  onDiscardEmpty,
  inputRef,
}: {
  about: boolean;
  value: string;
  placeholder?: string;
  roomy?: boolean;
  marked?: boolean;
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
      className={cn(
        "t-body bg-transparent caret-[var(--ink)]",
        marked ? "text-[#E23B2F]" : "text-[var(--ink)]",
        roomy && "min-h-11",
      )}
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
      {placeholder ? "Title" : title}
    </button>
  );
}

function RowButton({
  rowKey,
  text,
  marked,
  armed,
  onPick,
  onEdit,
  onArm,
  onDelete,
}: {
  rowKey: string;
  text: string;
  marked: boolean;
  armed: boolean;
  onPick?: () => void;
  onEdit: () => void;
  onArm: () => void;
  onDelete: () => void;
}) {
  const press = useLongPress(onArm, HOLD_MS);
  return (
    <div data-entry-row={rowKey} className="flex min-w-0 items-start gap-2">
      <button
        type="button"
        className={cn(
          "t-body min-w-0 flex-1 border-0 bg-transparent p-0 text-left whitespace-pre-wrap break-words",
          marked ? "text-[#E23B2F]" : "text-[var(--ink)]",
        )}
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
