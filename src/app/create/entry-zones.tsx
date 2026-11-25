"use client";

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { nanoid } from "nanoid";
import { ChevronDown, X } from "lucide-react";
import { MarkPlus } from "@/shared/components/mark-plus";
import { SectionNumber, sectionNumberLabel } from "@/shared/components/section-number";
import { useLongPress } from "@/shared/hooks/use-long-press";
import { openContactAttachmentPicker } from "@landing/components/photo-input-utils";
import { isProseValue, labeledEntryLine, nextExtraZoneId, nextHeaderChoice, suggestedSectionTitle, groupLibrary } from "@/shared/services/card-zones";
import { createEmptyContactItem, isContactFilled, normalizeContactItem } from "@/shared/services/contact-item";
import { commitComposerLine, toggleLibraryPick } from "@/app/create/composer-line";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { useAppStore } from "@/shared/store/app-store";
import type { Card, ContactItem } from "@/shared/types";
import { entryLineIsRed } from "@/shared/services/entry-line";
import type { QuestionnaireZone } from "@/shared/lib/fill-place";
import { detectAttachmentType, isPortfolioVideoFile } from "@/shared/services/portfolio-catalog";
import { isAttachmentType, type AttachmentContactType } from "@/shared/services/portfolio-limits";
import { WrapField, type WrapFieldHandle } from "@main/components/wrap-field";

const DELETE_RED = "#E23B2F";
/** A value Create refused. Same red as the row delete mark. */
export const ENTRY_MARK = DELETE_RED;
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
  /** Open the first of 01–03 that has no text, the same way a tap on its hint does. */
  focusFirstEmpty: () => void;
  /** Live rows, including a file that has not been uploaded. The questionnaire does not call this. */
  lines: () => { id: string; rows: EntryRow[] }[];
};

type EntryZonesProps = {
  onChange?: () => void;
  /** Second portfolio and a signed-in first form. A guest form leaves this off. */
  library?: boolean;
};

type OpenDraft = { text: string; included: boolean };

function blankCustom(zones: EntryZone[]) {
  return zones.find((zone) => zone.custom && !zone.title.trim() && zone.rows.length === 0) ?? null;
}

function storedLine(value: string, zoneId?: string) {
  return normalizeContactItem(createEmptyContactItem(0), value, zoneId).value;
}

function lineOf(row: EntryRow, zoneId: string) {
  return labeledEntryLine(row.value, row.type, zoneId);
}

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

/** A folded line has been stored. An open empty field stays under More until the text is committed. */
function zoneFilled(zone: EntryZone) {
  return zone.rows.some((row) => row.value.trim().length > 0);
}

function libraryRows(zoneId: string, items: ContactItem[], cards: Card[]) {
  const placements = cards.map((card) => ({
    id: card.id,
    contactItemIds: card.contactItemIds,
    itemZones: card.itemZones,
    rubricLabels: card.rubricLabels,
    hiddenZones: card.hiddenZones,
    rubricOrder: card.rubricOrder,
  }));
  const grouped = groupLibrary(
    items.filter(isContactFilled),
    { contactItemIds: [] },
    placements,
  );
  return grouped.find((section) => section.id === zoneId)?.rows ?? [];
}

function titled(zone: EntryZone, value: string, fileType?: AttachmentContactType | null): EntryZone {
  if (zone.title.trim()) return zone;
  const title = suggestedSectionTitle(value, fileType);
  return title ? { ...zone, title } : zone;
}

export const EntryZones = forwardRef<EntryZonesHandle, EntryZonesProps>(function EntryZones({ onChange, library = false }, ref) {
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
  const [moreOpen, setMoreOpen] = useState(false);
  const zonesRef = useRef(zones);
  const headerRef = useRef<string | null>(null);
  const editKeyRef = useRef<string | null>(null);
  const editTextRef = useRef("");
  const seedIdRef = useRef<string | null>(null);
  const seedTextRef = useRef("");
  const moreOpenRef = useRef(false);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const draftsRef = useRef<Record<string, OpenDraft>>({});
  const [drafts, setDrafts] = useState<Record<string, OpenDraft>>({});
  const composerRefs = useRef(new Map<string, WrapFieldHandle>());
  const typingHold = useRef(false);
  const [composerEpoch, setComposerEpoch] = useState(0);
  const libraryItems = useAppStore((state) => state.contactItems);
  const libraryCards = useAppStore((state) => state.cards);
  const [picked, setPicked] = useState<readonly string[]>([]);
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

  const setDraft = (zoneId: string, draft: OpenDraft) => {
    draftsRef.current = { ...draftsRef.current, [zoneId]: draft };
    setDrafts(draftsRef.current);
  };

  const commitComposer = (zoneId: string, text: string, keepFocus: boolean) => {
    const typed = text.trim();
    if (!typed) return;
    const included = draftsRef.current[zoneId]?.included !== false;
    const key = nanoid();
    const field = composerRefs.current.get(zoneId);
    const nextZones = zonesRef.current.map((zone) => {
      if (zone.id !== zoneId) return zone;
      const next = commitComposerLine(
        zone.rows.map((row) => ({ key: row.key, value: row.value })),
        typed,
        included,
        key,
      );
      if (next.length === zone.rows.length) return zone;
      const value = storedLine(typed, zoneId);
      return { ...titled(zone, value), rows: [...zone.rows, { key, value }] };
    });
    if (nextZones === zonesRef.current || nextZones.every((zone, index) => zone === zonesRef.current[index])) {
      if (keepFocus) field?.focusEnd();
      return;
    }
    const red = entryLineIsRed(zoneId, typed);
    setMarked((current) => {
      const next = new Set(current);
      if (red) next.add(key);
      else next.delete(key);
      return next;
    });
    zonesRef.current = nextZones;
    setZones(nextZones);
    setDraft(zoneId, { text: "", included: true });
    field?.clear();
    if (keepFocus) field?.focusEnd();
  };

  const toggleLibrary = (id: string) => {
    setPicked((current) => toggleLibraryPick(current, id));
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
          rows: zone.rows.map((row) => ({
            key: row.key,
            value: row.value,
            ...(row.type ? { type: row.type } : {}),
          })),
        })),
        headerKey: headerRef.current,
        editKey: editKeyRef.current,
        editText: editTextRef.current,
        seedId: Object.entries(draftsRef.current).find(([, draft]) => draft.text.trim())?.[0] ?? seedIdRef.current,
        seedText: Object.entries(draftsRef.current).find(([, draft]) => draft.text.trim())?.[1]?.text ?? seedTextRef.current,
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
        const drafts: Record<string, OpenDraft> = {};
        if (place.seedId && place.seedText.trim()) drafts[place.seedId] = { text: place.seedText, included: true };
        draftsRef.current = drafts;
        setDrafts(drafts);
        setComposerEpoch((epoch) => epoch + 1);
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
        const open = Object.entries(draftsRef.current).find(([, draft]) => draft.text.trim());
        const seedZone = open?.[0] ?? seedIdRef.current;
        const seedText = open?.[1]?.text ?? seedTextRef.current;
        const seedBad = Boolean(seedZone && entryLineIsRed(seedZone, seedText));
        if (seedBad && seedZone && !first) first = `seed:${seedZone}`;
        setMarked(new Set(bad));
        if (first && !moreOpenRef.current) {
          const zoneId = first.startsWith("seed:")
            ? first.slice(5)
            : zonesRef.current.find((zone) => zone.rows.some((row) => row.key === first))?.id;
          const zone = zonesRef.current.find((entry) => entry.id === zoneId);
          if (zone && (zone.custom || (FOLDED as readonly string[]).includes(zone.id))) setMoreOpen(true);
        }
        return first;
      },
      focusFirstEmpty: () => {
        const id = FIRST.find((zoneId) => {
          const zone = zonesRef.current.find((entry) => entry.id === zoneId);
          if (!zone) return true;
          const open = draftsRef.current[zoneId]?.text ?? (seedIdRef.current === zoneId ? seedTextRef.current : "");
          return !zoneHasText(zone, zoneId, open, editKeyRef.current, editTextRef.current);
        });
        if (!id) return;
        composerRefs.current.get(id)?.focusEnd();
      },
      lines: () => zonesRef.current.map((zone) => ({ id: zone.id, rows: zone.rows })),
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

  const paintRow = (key: string, zoneId: string | undefined, typed: string) => {
    const red = Boolean(zoneId && typed && entryLineIsRed(zoneId, typed));
    setMarked((current) => {
      const next = new Set(current);
      if (red) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const commitEdit = (key: string, text: string) => {
    const typed = text.trim();
    const zoneId = zonesRef.current.find((zone) => zone.rows.some((row) => row.key === key))?.id;
    const value = typed ? storedLine(typed, zoneId) : "";
    if (!value) releaseHeader(key);
    setEditKey(null);
    setEditText("");
    paintRow(key, zoneId, typed);
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
      if (!file || isPortfolioVideoFile(file)) return;
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
  const folded = pick(FOLDED);
  const filledFold = folded.filter(zoneFilled);
  const emptyFold = folded.filter((zone) => !zoneFilled(zone));
  const custom = zones.filter((zone) => zone.custom);
  const showMore = emptyFold.length > 0;
  const showRest = !showMore || moreOpen;
  const section = (zone: EntryZone, index: number) => {
        const hint = zone.custom ? NEW_HINT : HINTS[zone.id];
        const about = zone.id === "about";
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
                      composerRefs.current.get(zone.id)?.focusEnd();
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
              {zone.id === "files" ? null : (
                <SectionComposer
                  key={`${zone.id}:${composerEpoch}`}
                  zoneId={zone.id}
                  hint={hint}
                  about={about}
                  text={drafts[zone.id]?.text ?? ""}
                  checked={drafts[zone.id]?.included !== false}
                  initial={draftsRef.current[zone.id]?.text ?? ""}
                  onText={(next) => {
                    const prev = draftsRef.current[zone.id] ?? { text: "", included: true };
                    setDraft(zone.id, { text: next, included: next.trim() ? prev.included !== false : true });
                  }}
                  onToggle={() => {
                    const prev = draftsRef.current[zone.id] ?? { text: "", included: true };
                    setDraft(zone.id, { text: prev.text, included: prev.included === false });
                  }}
                  onCommit={(value, keepFocus) => commitComposer(zone.id, value, keepFocus)}
                  holdRef={typingHold}
                  bind={(handle) => {
                    if (handle) composerRefs.current.set(zone.id, handle);
                    else composerRefs.current.delete(zone.id);
                  }}
                />
              )}
              {zone.rows.map((row) =>
                editKey === row.key ? (
                  <div key={row.key} data-entry-row={row.key} className="min-w-0">
                    <Field
                      about={about}
                      value={editText}
                      placeholder=""
                      marked={false}
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
                      if (row.file || (row.type != null && isAttachmentType(row.type))) {
                        setArmed(row.key);
                        return;
                      }
                      setEditKey(row.key);
                      setEditText(row.value);
                      setArmed(null);
                    }}
                    onArm={() => setArmed(row.key)}
                    onDelete={() => {
                      releaseHeader(row.key);
                      const nextZones = zonesRef.current.map((entry) =>
                        entry.id === zone.id ? { ...entry, rows: entry.rows.filter((item) => item.key !== row.key) } : entry,
                      );
                      zonesRef.current = nextZones;
                      setZones(nextZones);
                      setArmed(null);
                    }}
                  />
                ),
              )}
              {library
                ? libraryRows(zone.id, libraryItems, libraryCards).map((row) => {
                    const item = row.item;
                    if (!item) return null;
                    const checked = picked.includes(item.id);
                    return (
                      <div key={item.id} className="relative min-w-0">
                        <p
                          className={cn(
                            "t-body mr-[26px] whitespace-pre-wrap break-words",
                            checked ? "text-[var(--ink)]" : "text-[var(--placeholder)]",
                          )}
                        >
                          {row.value}
                        </p>
                        <LineCheck
                          checked={checked}
                          label={checked ? "Remove from portfolio" : "Add to portfolio"}
                          onHold={(down) => {
                            typingHold.current = down;
                          }}
                          onToggle={() => toggleLibrary(item.id)}
                        />
                      </div>
                    );
                  })
                : null}
              {zone.id === "files" ? (
                <>
                  {zone.rows.length === 0 ? (
                    <p className="t-body min-h-11 text-[var(--placeholder)]">
                      <HintLine text={hint} />
                    </p>
                  ) : null}
                  <button
                    type="button"
                    aria-label="Add file"
                    className="border-0 bg-transparent p-0 text-left text-[var(--ink)]"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => addFile(zone.id)}
                  >
                    <MarkPlus className="text-[var(--ink)]" />
                  </button>
                </>
              ) : null}
            </div>
          </section>
        );
  };

  const filledStart = head.length;
  const restStart = filledStart + filledFold.length;
  return (
    <div className="mt-[18px]">
      {head.map((zone, index) => section(zone, index))}
      {filledFold.map((zone, index) => section(zone, filledStart + index))}
      {showMore ? (
        <MoreRow
          open={moreOpen}
          hint={emptyFold.map((zone) => zone.title).join(", ")}
          onToggle={() => setMoreOpen((current) => !current)}
        />
      ) : null}
      {showRest ? emptyFold.map((zone, index) => section(zone, restStart + index)) : null}
      {showRest
        ? custom.map((zone, index) => section(zone, restStart + emptyFold.length + index))
        : null}
      {showRest ? (
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

/** One star for every required field. Size is the hint (`t-body`), never the caps label. */
export function RequiredStar({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "t-body relative -top-[0.35em] ml-[0.15em] inline-block leading-none! text-[var(--ink)] normal-case",
        className,
      )}
    >
      *
    </span>
  );
}

function HintLine({ text }: { text: string }) {
  return text;
}

function MoreRow({ open, hint, onToggle }: { open: boolean; hint: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      className="grid w-full grid-cols-[86px_minmax(0,1fr)] items-center gap-x-[14px] border-0 bg-transparent p-0 py-[18px] text-left"
      onClick={onToggle}
    >
      <span className="t-label">More</span>
      <span className="flex min-w-0 items-center gap-3">
        {open ? <span className="min-w-0 flex-1" /> : (
          <span className="t-body min-w-0 flex-1 text-[var(--placeholder)]">{hint}</span>
        )}
        <ChevronDown
          className={cn("size-4 shrink-0 text-[var(--ink)]", open && "rotate-180")}
          strokeWidth={1.5}
          aria-hidden
        />
      </span>
    </button>
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
  quiet = false,
  armed,
  onPick,
  onEdit,
  onArm,
  onDelete,
}: {
  rowKey: string;
  text: string;
  marked: boolean;
  quiet?: boolean;
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
          marked ? "text-[#E23B2F]" : quiet ? "text-[var(--placeholder)]" : "text-[var(--ink)]",
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

function LineCheck({
  checked,
  label,
  onToggle,
  onHold,
}: {
  checked: boolean;
  label: string;
  onToggle: () => void;
  onHold?: (down: boolean) => void;
}) {
  const origin = useRef<{ x: number; y: number } | null>(null);
  return (
    <div
      className="absolute top-0 right-0"
      style={{ touchAction: "pan-y" }}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onHold?.(true);
        origin.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const start = origin.current;
        origin.current = null;
        const moved = start
          ? (event.clientX - start.x) ** 2 + (event.clientY - start.y) ** 2 > 12 * 12
          : false;
        if (!moved) onToggle();
        onHold?.(false);
      }}
      onPointerCancel={() => {
        origin.current = null;
        onHold?.(false);
      }}
    >
      <Checkbox
        variant="library"
        checked={checked}
        aria-label={label}
        tabIndex={-1}
        data-no-swipe
        className="pointer-events-none relative z-10 -mr-[11px] -mt-[11px]"
      />
    </div>
  );
}

function SectionComposer({
  zoneId,
  hint,
  about,
  text,
  checked,
  initial,
  onText,
  onToggle,
  onCommit,
  holdRef,
  bind,
}: {
  zoneId: string;
  hint: string;
  about: boolean;
  text: string;
  checked: boolean;
  initial: string;
  onText: (value: string) => void;
  onToggle: () => void;
  onCommit: (value: string, keepFocus: boolean) => void;
  holdRef: RefObject<boolean>;
  bind: (handle: WrapFieldHandle | null) => void;
}) {
  const showBox = text.trim().length > 0;
  return (
    <div className="relative min-w-0" data-entry-seed={zoneId} data-entry-composer={zoneId}>
      <div className={showBox ? "mr-[26px]" : undefined}>
        <WrapField
          ref={bind}
          initial={initial}
          label={hint}
          placeholder={hint}
          multiline={about}
          breakButton={false}
          wrapPlaceholder
          placeholderClassName="t-body text-[var(--placeholder)]"
          onTextChange={onText}
          onDone={(value) => {
            if (about) return;
            onCommit(value, true);
          }}
          onBlur={(value) => {
            if (holdRef.current) return;
            onCommit(value, false);
          }}
          className="t-body min-h-11 bg-transparent text-[var(--ink)] caret-[var(--ink)]"
        />
      </div>
      {showBox ? (
        <LineCheck
          checked={checked}
          label={checked ? "Remove from portfolio" : "Add to portfolio"}
          onHold={(down) => {
            holdRef.current = down;
          }}
          onToggle={onToggle}
        />
      ) : null}
    </div>
  );
}
