"use client";

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { nanoid } from "nanoid";
import { ChevronDown, X } from "lucide-react";
import { MarkPlus } from "@/shared/components/mark-plus";
import { SectionNumber, sectionNumberLabel } from "@/shared/components/section-number";
import { useLongPress } from "@/shared/hooks/use-long-press";
import { openContactAttachmentPicker } from "@landing/components/photo-input-utils";
import { decideComposerLine } from "@/app/create/composer-line";
import { LibraryLine, SectionWriteLine } from "@/shared/components/section-write-line";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { isProseValue, groupLibrary, labeledEntryLine, nextExtraZoneId, nextHeaderChoice, suggestedSectionTitle } from "@/shared/services/card-zones";
import { createEmptyContactItem, isContactFilled, normalizeContactItem } from "@/shared/services/contact-item";
import { useAppStore } from "@/shared/store/app-store";
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
  /** False: the line stays in the library and is not on this portfolio. */
  onCard?: boolean;
  /** A library row that was ticked, not typed again. */
  itemId?: string;
};

let skipQuestionnaireCommit = false;

/** Back was pressed. The open line must not become a row. */
export function cancelQuestionnaireCommit() {
  skipQuestionnaireCommit = true;
}

export function releaseQuestionnaireCommit() {
  skipQuestionnaireCommit = false;
}

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
    picked: string[];
  };
  restore: (place: {
    zones: QuestionnaireZone[];
    headerKey: string | null;
    editKey: string | null;
    editText: string;
    seedId: string | null;
    seedText: string;
    picked?: string[];
  }) => void;
  /** Paints refused values and returns the first one. `seed:` is an open line. */
  markProblems: () => string | null;
  /** Open the first of 01–03 that has no text, the same way a tap on its hint does. */
  focusFirstEmpty: () => void;
  /** Live rows, including a file that has not been uploaded. The questionnaire does not call this. */
  lines: () => { id: string; rows: EntryRow[] }[];
  /** Write every leftover line the way Enter does, before the red check. */
  commitOpen: () => void;
  /** Library rows ticked for this portfolio, with the section they belong to. */
  picks: () => { zoneId: string; id: string; value: string }[];
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
  const [moreOpen, setMoreOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const libraryItems = useAppStore((state) => state.contactItems);
  const libraryCards = useAppStore((state) => state.cards);
  const zonesRef = useRef(zones);
  const headerRef = useRef<string | null>(null);
  const editKeyRef = useRef<string | null>(null);
  const editTextRef = useRef("");
  const seedIdRef = useRef<string | null>(null);
  const seedTextRef = useRef("");
  const moreOpenRef = useRef(false);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const valueRef = useRef<WrapFieldHandle>(null);
  const composerRefs = useRef(new Map<string, WrapFieldHandle>());
  const pickedRef = useRef<string[]>([]);
  const commitLineRef = useRef<(zoneId: string, text: string) => void>(() => undefined);
  const focusValue = useRef(false);
  const onChangeRef = useRef(onChange);
  zonesRef.current = zones;
  editKeyRef.current = editKey;
  editTextRef.current = editText;
  seedIdRef.current = seedId;
  seedTextRef.current = seedText;
  moreOpenRef.current = moreOpen;
  pickedRef.current = picked;
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
          rows: zone.rows.map((row) => ({
            key: row.key,
            value: row.value,
            ...(row.type ? { type: row.type } : {}),
            ...(row.onCard === false ? { onCard: false } : {}),
            ...(row.itemId ? { itemId: row.itemId } : {}),
          })),
        })),
        headerKey: headerRef.current,
        editKey: editKeyRef.current,
        editText: editTextRef.current,
        seedId: seedIdRef.current,
        seedText: seedTextRef.current,
        picked: pickedRef.current,
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
            ...(row.onCard === false ? { onCard: false } : {}),
            ...(row.itemId ? { itemId: row.itemId } : {}),
          })),
        }));
        zonesRef.current = zones;
        setZones(zones);
        const ticks = place.picked ?? [];
        pickedRef.current = ticks;
        setPicked(ticks);
        if (zones.some((zone) => zone.rows.length > 0) || ticks.length > 0) setOpened(true);
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
          return !zoneHasText(zone, seedIdRef.current, seedTextRef.current, editKeyRef.current, editTextRef.current);
        });
        if (!id) return;
        if (seedIdRef.current === id && !seedTextRef.current.trim()) {
          valueRef.current?.focusEnd();
          return;
        }
        focusValue.current = true;
        setSeedId(id);
        setSeedText("");
      },
      lines: () => zonesRef.current.map((zone) => ({ id: zone.id, rows: zone.rows })),
      commitOpen: () => {
        for (const zone of zonesRef.current) {
          if (zone.id === "files") continue;
          const text = composerRefs.current.get(zone.id)?.text() ?? "";
          if (text.trim()) commitLineRef.current(zone.id, text);
        }
      },
      picks: () => {
        const wanted = new Set(pickedRef.current);
        if (wanted.size === 0) return [];
        const grouped = groupLibrary(
          useAppStore.getState().contactItems.filter(isContactFilled),
          { contactItemIds: [] },
          useAppStore.getState().cards.map((card) => ({
            id: card.id,
            contactItemIds: card.contactItemIds,
            itemZones: card.itemZones,
            rubricLabels: card.rubricLabels,
            hiddenZones: card.hiddenZones,
            rubricOrder: card.rubricOrder,
          })),
        );
        return grouped.flatMap((section) =>
          section.rows.flatMap((row) => {
            const item = row.item;
            if (!item || !wanted.has(item.id)) return [];
            return [{ zoneId: section.id, id: item.id, value: item.value.trim() }];
          }),
        );
      },
    }),
    [],
  );

  useEffect(() => {
    onChangeRef.current?.();
  }, [zones, editKey, editText, seedId, seedText, headerKey, picked]);

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

  useLayoutEffect(() => {
    if (!focusValue.current) return;
    const id = seedIdRef.current;
    const field = id ? composerRefs.current.get(id) : null;
    if (!field) return;
    focusValue.current = false;
    field.focusEnd();
  }, [seedId, opened, zones]);

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

  const paintRow = (key: string, zoneId: string | undefined, typed: string) => {
    const red = Boolean(zoneId && typed && entryLineIsRed(zoneId, typed));
    setMarked((current) => {
      const next = new Set(current);
      if (red) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const finishLine = (zoneId: string) => {
    const field = composerRefs.current.get(zoneId);
    field?.clear();
    field?.focusEnd();
    if (seedIdRef.current === zoneId) {
      seedTextRef.current = "";
      setSeedText("");
    }
  };

  const commitLine = (zoneId: string, text: string) => {
    const value = text.trim() ? storedLine(text, zoneId) : "";
    if (!value) return;
    const zone = zonesRef.current.find((entry) => entry.id === zoneId);
    const library = libraryItems.filter(isContactFilled).map((item) => ({ id: item.id, value: item.value }));
    const decision = decideComposerLine(
      value,
      (zone?.rows ?? []).map((row) => ({ key: row.key, value: row.value, onCard: row.onCard !== false })),
      library,
    );
    if (decision.kind === "empty") return;
    if (decision.kind === "library") {
      setPicked((current) => {
        const next = current.includes(decision.id) ? current : [...current, decision.id];
        pickedRef.current = next;
        return next;
      });
      finishLine(zoneId);
      return;
    }
    if (decision.kind === "local") {
      const next = zonesRef.current.map((entry) =>
        entry.id === zoneId
          ? { ...entry, rows: entry.rows.map((row) => (row.key === decision.key ? { ...row, onCard: true } : row)) }
          : entry,
      );
      zonesRef.current = next;
      setZones(next);
      finishLine(zoneId);
      return;
    }
    const key = nanoid();
    const next = zonesRef.current.map((entry) =>
      entry.id === zoneId ? { ...titled(entry, value), rows: [...entry.rows, { key, value, onCard: true }] } : entry,
    );
    zonesRef.current = next;
    setZones(next);
    paintRow(key, zoneId, text.trim());
    finishLine(zoneId);
  };
  commitLineRef.current = commitLine;

  const commitSeed = (zoneId: string, text: string) => {
    const typed = text.trim();
    const value = typed ? storedLine(typed, zoneId) : "";
    setSeedId(null);
    setSeedText("");
    if (!value) return;
    const key = nanoid();
    setZones((current) =>
      current.map((zone) =>
        zone.id === zoneId ? { ...titled(zone, value), rows: [...zone.rows, { key, value }] } : zone,
      ),
    );
    paintRow(key, zoneId, typed);
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
  const libraryGroups = opened
    ? groupLibrary(
        libraryItems.filter(isContactFilled),
        { contactItemIds: [] },
        libraryCards.map((card) => ({
          id: card.id,
          contactItemIds: card.contactItemIds,
          itemZones: card.itemZones,
          rubricLabels: card.rubricLabels,
          hiddenZones: card.hiddenZones,
          rubricOrder: card.rubricOrder,
        })),
      )
    : [];
  const openSection = (zoneId: string) => {
    setOpened(true);
    focusValue.current = true;
    setSeedId(zoneId);
    setSeedText("");
  };
  const section = (zone: EntryZone, index: number) => {
        const hint = zone.custom ? NEW_HINT : HINTS[zone.id];
        const about = zone.id === "about";
        const promotable = zone.id === "position" || zone.id === "company";
        const spareCount = opened
          ? (libraryGroups.find((group) => group.id === zone.id)?.rows.length ?? 0)
          : 0;
        const above = zone.rows.length + spareCount > 0;
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
            <div className="flex min-w-0 flex-col">
              {!opened && zone.rows.length === 0 ? (
                <button
                  type="button"
                  className="t-body min-h-11 w-full border-0 bg-transparent p-0 text-left text-[var(--placeholder)]"
                  onClick={() => openSection(zone.id)}
                >
                  <HintLine text={hint} />
                </button>
              ) : (
                <>
                  <div className="flex flex-col gap-[10px]">
                    {opened
                      ? (libraryGroups.find((group) => group.id === zone.id)?.rows ?? []).flatMap((row) => {
                          const item = row.item;
                          if (!item || zone.rows.some((entry) => entry.itemId === item.id)) return [];
                          const checked = picked.includes(item.id);
                          return [
                            <LibraryLine
                              key={item.id}
                              text={row.value}
                              checked={checked}
                              onToggle={() =>
                                setPicked((current) => {
                                  const next = current.includes(item.id)
                                    ? current.filter((id) => id !== item.id)
                                    : [...current, item.id];
                                  pickedRef.current = next;
                                  return next;
                                })
                              }
                            />,
                          ];
                        })
                      : null}
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
                          onCard={row.onCard !== false}
                          armed={armed === row.key}
                          onToggle={() =>
                            setZones((current) =>
                              current.map((entry) =>
                                entry.id === zone.id
                                  ? {
                                      ...entry,
                                      rows: entry.rows.map((item) =>
                                        item.key === row.key ? { ...item, onCard: item.onCard === false } : item,
                                      ),
                                    }
                                  : entry,
                              ),
                            )
                          }
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
                            setZones((current) =>
                              current.map((entry) =>
                                entry.id === zone.id
                                  ? { ...entry, rows: entry.rows.filter((item) => item.key !== row.key) }
                                  : entry,
                              ),
                            );
                            setArmed(null);
                          }}
                        />
                      ),
                    )}
                  </div>
                  {zone.id === "files" ? (
                    <div className={above ? "mt-[18px]" : undefined}>
                      {zone.rows.length === 0 ? (
                        <p className="t-body min-h-11 text-[var(--placeholder)]">
                          <HintLine text={hint} />
                        </p>
                      ) : null}
                      <button
                        type="button"
                        aria-label="Add file"
                        className="relative size-5 border-0 bg-transparent p-0 text-left text-[var(--ink)]"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => addFile(zone.id)}
                      >
                        <MarkPlus size={23} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[var(--ink)]" />
                      </button>
                    </div>
                  ) : (
                    <div className={above ? "mt-[18px]" : undefined}>
                      <SectionWriteLine
                        zoneId={zone.id}
                        hint={hint}
                        about={about}
                        initial={seedId === zone.id ? seedText : ""}
                        autoFocus={seedId === zone.id && titleId !== zone.id}
                        inputRef={(handle) => {
                          if (handle) composerRefs.current.set(zone.id, handle);
                          else composerRefs.current.delete(zone.id);
                        }}
                        onTextChange={(text) => {
                          seedIdRef.current = zone.id;
                          seedTextRef.current = text;
                          setSeedId(zone.id);
                          setSeedText(text);
                        }}
                        onCommit={(text) => {
                          if (skipQuestionnaireCommit) return;
                          commitLine(zone.id, text);
                        }}
                        onBlur={(text) => {
                          if (skipQuestionnaireCommit) return;
                          commitLine(zone.id, text);
                        }}
                      />
                    </div>
                  )}
                </>
              )}
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
        <div className="flex justify-center py-[18px]">
          <button type="button" aria-label="Add section" className="relative size-5 border-0 bg-transparent p-0 text-[var(--ink)]" onClick={addZone}>
            <MarkPlus size={23} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
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
  onCard = true,
  armed,
  onToggle,
  onPick,
  onEdit,
  onArm,
  onDelete,
}: {
  rowKey: string;
  text: string;
  marked: boolean;
  onCard?: boolean;
  armed: boolean;
  onToggle?: () => void;
  onPick?: () => void;
  onEdit: () => void;
  onArm: () => void;
  onDelete: () => void;
}) {
  const press = useLongPress(onArm, HOLD_MS);
  const color = marked ? "#E23B2F" : onCard ? "var(--ink)" : "var(--placeholder)";
  return (
    <div data-entry-row={rowKey} className="relative min-w-0">
      <button
        type="button"
        className="t-body mr-[26px] min-w-0 border-0 bg-transparent p-0 text-left whitespace-pre-wrap break-words"
        style={{ color }}
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
        <button type="button" data-entry-delete="" aria-label="Delete row" className="absolute top-0 right-0 shrink-0 border-0 bg-transparent p-0" onClick={onDelete}>
          <X className="size-4" strokeWidth={1.5} style={{ color: DELETE_RED }} aria-hidden />
        </button>
      ) : onToggle ? (
        <div className="absolute top-0 right-0">
          <Checkbox
            variant="library"
            checked={onCard}
            data-no-swipe
            aria-label={onCard ? "Remove from portfolio" : "Add to portfolio"}
            className="relative z-10 -mr-[11px] -mt-[11px]"
            onCheckedChange={(next) => {
              if (Boolean(next) === onCard) return;
              onToggle();
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
