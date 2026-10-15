"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  defaultDropAnimationSideEffects,
  useDraggable,
  useSensor,
  useSensors,
  type DragMoveEvent,
  type DragStartEvent,
  type DropAnimation,
  type KeyboardSensorOptions,
  type PointerSensorOptions,
} from "@dnd-kit/core";
import { MotionConfig, motion } from "motion/react";
import { GripHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionNumber, ValueCap, sectionNumberLabel } from "@/shared/components/section-number";
import { openHomeScreenAttachmentPdf } from "@/shared/components/pdf-preview-host";
import { ARRANGE_HOLD_MS, REORDER_SLOP_PX } from "@/shared/lib/reorder-hold";
import { tick } from "@/shared/lib/haptic";
import {
  applyRubricMove,
  isChoosableHeader,
  normalizeRubricOrder,
  placeItemInZone,
  type CardDisplayRow,
  type CardZoneId,
  type CardZoneSection,
} from "@/shared/services/card-zones";
import { isAttachmentType } from "@/shared/services/portfolio-limits";
import { fileStatusLine, useUploadStatus } from "@/shared/store/upload-status";

/** A row held in a gap this long opens a new section there. */
const GAP_DWELL_MS = 220;
/** The band at a section's top and bottom edge that counts as the gap. */
const SECTION_EDGE_PX = 12;
/** Further than this left or right of the column, the drop puts the row back. */
const OFF_COLUMN_PX = 24;
/** Layout keeps springing this long after the drop. */
const SETTLE_MS = 450;
const NEW_FIELD_ID = "__new-field";
const NEW_FIELD_TITLE = "New field";
/** A new section takes the first of these the card does not show yet. */
const SPARE_ZONES: CardZoneId[] = [
  "additional",
  "background",
  "education",
  "languages",
  "lifestyle",
  "age",
  "location",
  "company",
  "position",
  "web",
  "social",
  "files",
  "contact",
  "name",
];

const SPRING = { type: "spring", stiffness: 520, damping: 40, mass: 0.9 } as const;
const LIFT_SHADOW = "shadow-[0_10px_22px_rgba(20,20,20,0.14)]";
const DROP: DropAnimation = {
  duration: 300,
  easing: "cubic-bezier(0.22, 1.15, 0.36, 1)",
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: "0" } } }),
};

export type NewSection = { title: string; order: string[] };

type Held = { kind: "item"; id: string; zoneId: string } | { kind: "rubric"; id: string };
type Aim = { kind: "zone"; zoneId: string; index: number } | { kind: "new"; gap: number } | { kind: "rubric"; index: number };
type ViewZone = { id: string; title: string; rows: CardDisplayRow[]; fresh?: boolean };

function onGrip(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("[data-row-handle], [data-rubric-handle]"));
}

/** In arrange mode a grip lifts at once. */
class GripSensor extends PointerSensor {
  static activators = [
    {
      eventName: "onPointerDown" as const,
      handler: ({ nativeEvent }: { nativeEvent: PointerEvent }, { onActivation }: PointerSensorOptions) => {
        if (!nativeEvent.isPrimary || nativeEvent.button !== 0 || !onGrip(nativeEvent.target)) return false;
        onActivation?.({ event: nativeEvent });
        return true;
      },
    },
  ];
}

/** Anywhere else a hold lifts the row or the section under the finger. */
class HoldSensor extends PointerSensor {
  static activators = [
    {
      eventName: "onPointerDown" as const,
      handler: ({ nativeEvent }: { nativeEvent: PointerEvent }, { onActivation }: PointerSensorOptions) => {
        if (!nativeEvent.isPrimary || nativeEvent.button !== 0 || onGrip(nativeEvent.target)) return false;
        const target = nativeEvent.target;
        if (target instanceof Element && target.closest("input, textarea, [data-arrange-done]")) return false;
        onActivation?.({ event: nativeEvent });
        return true;
      },
    },
  ];
}

/** Keys move a row only from its grip, so Enter on a link still opens it. */
class GripKeys extends KeyboardSensor {
  static activators = [
    {
      eventName: "onKeyDown" as const,
      handler: (
        event: ReactKeyboardEvent,
        options: KeyboardSensorOptions,
        context: Parameters<(typeof KeyboardSensor.activators)[number]["handler"]>[2],
      ) => onGrip(event.target) && KeyboardSensor.activators[0].handler(event, options, context),
    },
  ];
}

function prefersMotion() {
  return typeof window !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function blockTouchMove(event: TouchEvent) {
  event.preventDefault();
}

const noSubscribe = () => () => {};

function useOnClient() {
  return useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
}

/** Layout top inside `root`. Transforms from a running spring do not count. */
function topWithin(node: HTMLElement, root: HTMLElement) {
  let top = 0;
  let current: HTMLElement | null = node;
  while (current && current !== root) {
    top += current.offsetTop;
    current = current.offsetParent as HTMLElement | null;
  }
  return top;
}

function sectionNodes(list: HTMLElement) {
  return [...list.querySelectorAll<HTMLElement>(":scope > [data-rubric]")];
}

type ItemHit = { fresh: true } | { zoneId: string; index: number } | { gap: number };

/** Over a section's rows, the slot there. In a gap, the gap's index among the real sections. */
function itemHit(list: HTMLElement, y: number, heldId: string): ItemHit {
  let gap = 0;
  for (const section of sectionNodes(list)) {
    const top = topWithin(section, list);
    const bottom = top + section.offsetHeight;
    if (section.dataset.rubric === NEW_FIELD_ID) {
      if (y >= top && y < bottom) return { fresh: true };
      continue;
    }
    if (y >= top + SECTION_EDGE_PX && y < bottom - SECTION_EDGE_PX) {
      const rows = [...section.querySelectorAll<HTMLElement>("[data-reorder-row]")].filter(
        (row) => row.dataset.reorderRow !== heldId,
      );
      let index = rows.length;
      for (let slot = 0; slot < rows.length; slot += 1) {
        const row = rows[slot];
        const rowTop = topWithin(row, list);
        // A long block counts as one stop: crossing its lower edge lands above the whole block.
        const boundary = row.offsetHeight > 96 ? rowTop + row.offsetHeight : rowTop + row.offsetHeight / 2;
        if (y < boundary) {
          index = slot;
          break;
        }
      }
      return { zoneId: section.dataset.rubric ?? "", index };
    }
    if (y >= (top + bottom) / 2) gap += 1;
  }
  return { gap };
}

function rubricHit(list: HTMLElement, y: number, heldId: string) {
  let index = 0;
  for (const section of sectionNodes(list)) {
    if (section.dataset.rubric === heldId) continue;
    if (y > topWithin(section, list) + section.offsetHeight / 2) index += 1;
  }
  return index;
}

function sameAim(a: Aim | null, b: Aim | null) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The sections as they would look if the held row or section were dropped now. */
function draftZones(zones: CardZoneSection[], held: Held | null, aim: Aim | null): ViewZone[] {
  if (!held || !aim) return zones;
  if (held.kind === "rubric") {
    if (aim.kind !== "rubric") return zones;
    const from = zones.findIndex((zone) => zone.id === held.id);
    if (from < 0) return zones;
    const next: ViewZone[] = [...zones];
    const [moved] = next.splice(from, 1);
    next.splice(aim.index, 0, moved);
    return next;
  }
  const row = zones.flatMap((zone) => zone.rows).find((entry) => entry.item?.id === held.id);
  if (!row || aim.kind === "rubric") return zones;
  const rest: ViewZone[] = zones.map((zone) => ({ ...zone, rows: zone.rows.filter((entry) => entry !== row) }));
  if (aim.kind === "new") {
    rest.splice(aim.gap, 0, { id: NEW_FIELD_ID, title: NEW_FIELD_TITLE, rows: [row], fresh: true });
    return rest;
  }
  return rest.map((zone) => {
    if (zone.id !== aim.zoneId) return zone;
    const rows = [...zone.rows];
    rows.splice(Math.min(aim.index, rows.length), 0, row);
    return { ...zone, rows };
  });
}

function rowIds(zone: { rows: CardDisplayRow[] } | undefined) {
  return zone?.rows.flatMap((row) => (row.item ? [row.item.id] : [])) ?? [];
}

function cardHeader(list: HTMLElement) {
  const scroll = list.closest(".compass-card-scroll");
  const header = scroll?.parentElement?.previousElementSibling;
  return header instanceof HTMLElement ? header : null;
}

export function isHeaderRole(row: CardDisplayRow) {
  return Boolean(row.item && isChoosableHeader(row.item));
}

function EditorialValue({
  row,
  onChooseHeader,
  underlineLink = false,
  onRetryFile,
}: {
  row: CardDisplayRow;
  onChooseHeader?: (itemId: string) => void;
  /** Public card: underline only the link value, not the platform prefix. */
  underlineLink?: boolean;
  /** Owner card: file rows show their upload state, and a failed one asks for the file again. */
  onRetryFile?: (itemId: string) => void;
}) {
  const itemId = row.item?.id;
  const fileStatus = useUploadStatus((state) => (itemId ? state.byItem[itemId] : undefined));
  const statusLine =
    onRetryFile && row.item && isAttachmentType(row.item.type) ? fileStatusLine(fileStatus, row.url) : null;
  const failed = statusLine !== null && fileStatus?.state !== "uploading";
  const marked = underlineLink && Boolean(row.url);
  const value = marked ? (
    <span className="underline decoration-[#c9c6bf] underline-offset-[3px] [text-decoration-thickness:1px]">
      {row.value}
    </span>
  ) : (
    row.value
  );
  const choose = onChooseHeader && isHeaderRole(row);
  const body = (
    <span
      className={cn(
        "block min-w-0 break-words t-body text-[var(--ink)] no-underline",
        (row.value.includes("\n") || row.value.includes("  ")) && "whitespace-pre-wrap",
      )}
    >
      {row.axis ? (
        <>
          {row.axis}
          {" / "}
          {value}
        </>
      ) : (
        value
      )}
      {statusLine ? <span className="block t-meta text-[var(--grey)]">{statusLine}</span> : null}
    </span>
  );

  if (failed && row.item && onRetryFile) {
    const failedId = row.item.id;
    return (
      <button
        type="button"
        data-card-content
        onClick={(event) => {
          event.stopPropagation();
          onRetryFile(failedId);
        }}
        className="block w-full min-w-0 text-left"
      >
        {body}
      </button>
    );
  }

  if (row.item && row.url) {
    return (
      <a
        data-card-content
        href={row.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => {
          event.stopPropagation();
          if (row.item?.type === "pdf" && openHomeScreenAttachmentPdf(row.url, row.value || "PDF")) {
            event.preventDefault();
          }
        }}
        className="block min-w-0 no-underline"
      >
        {body}
      </a>
    );
  }

  return (
    <span
      data-card-content
      onClick={
        choose && row.item
          ? (event) => {
              event.stopPropagation();
              onChooseHeader?.(row.item!.id);
            }
          : undefined
      }
    >
      {body}
    </span>
  );
}

type ValueProps = {
  onChooseHeader?: (itemId: string) => void;
  underlineLink: boolean;
  onRetryFile?: (itemId: string) => void;
};

function SectionBody({
  number,
  title,
  arranging,
  children,
}: {
  number: string;
  title: string;
  arranging: boolean;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[86px_minmax(0,1fr)] items-start gap-x-[14px]">
      <div className="min-w-0">
        <SectionNumber value={number} />
        <span className={cn("t-label mt-[6px] block min-w-0 whitespace-normal line-clamp-3", arranging && "pr-6")}>
          {title}
        </span>
      </div>
      <ValueCap className="flex min-w-0 flex-col gap-[6px]">{children}</ValueCap>
    </div>
  );
}

function Grip({ label, className, ...rest }: { label: string } & ComponentProps<"button">) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn("flex size-6 touch-none items-center justify-center text-[var(--ink)]", className)}
      {...rest}
    >
      <GripHorizontal className="size-4" strokeWidth={1.5} aria-hidden />
    </button>
  );
}

function ArrangeRow({
  row,
  zoneId,
  arranging,
  dimmed,
  placeholder,
  springs,
  value,
}: {
  row: CardDisplayRow;
  zoneId: string;
  arranging: boolean;
  dimmed: boolean;
  placeholder: boolean;
  springs: boolean;
  value: ValueProps;
}) {
  const itemId = row.item?.id ?? row.key;
  const { setNodeRef, setActivatorNodeRef, listeners, attributes } = useDraggable({
    id: `item:${itemId}`,
    data: { kind: "item", zoneId },
  });
  return (
    <motion.div
      ref={setNodeRef}
      {...listeners}
      layout={springs ? "position" : false}
      transition={SPRING}
      data-reorder-row={row.item?.id}
      className={cn("relative", placeholder && "outline-1 outline-dashed outline-[var(--rule)]")}
    >
      <div
        className={cn(
          "min-w-0 transition-opacity duration-200 motion-reduce:transition-none",
          arranging && "pr-7",
          placeholder ? "opacity-0" : dimmed && "opacity-45",
        )}
      >
        <EditorialValue row={row} {...value} />
      </div>
      {arranging ? (
        <Grip
          ref={setActivatorNodeRef}
          {...attributes}
          label="Reorder row"
          data-row-handle=""
          className="absolute top-0 right-0"
        />
      ) : null}
    </motion.div>
  );
}

function ArrangeSection({
  zone,
  number,
  last,
  arranging,
  movable,
  lifted,
  entered,
  springs,
  children,
}: {
  zone: ViewZone;
  number: string;
  last: boolean;
  arranging: boolean;
  movable: boolean;
  lifted: boolean;
  entered: boolean;
  springs: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, setActivatorNodeRef, listeners, attributes } = useDraggable({
    id: `zone:${zone.id}`,
    data: { kind: "rubric" },
    disabled: !movable || Boolean(zone.fresh),
  });
  return (
    <motion.section
      ref={setNodeRef}
      {...listeners}
      layout={springs ? "position" : false}
      transition={SPRING}
      data-rubric={zone.id}
      className={cn(
        "relative min-w-0 py-[18px] transition-colors duration-200 motion-reduce:transition-none",
        !last && "border-b border-[var(--rule)]",
        entered && "bg-sky",
        lifted && "outline-1 outline-dashed outline-[var(--rule)]",
      )}
    >
      {arranging && movable && !zone.fresh ? (
        <Grip
          ref={setActivatorNodeRef}
          {...attributes}
          label="Reorder section"
          data-rubric-handle=""
          className="absolute top-[18px] z-10"
          style={{ left: 62 }}
        />
      ) : null}
      <div className={cn(lifted && "opacity-0")}>
        <SectionBody number={number} title={zone.title} arranging={arranging}>
          {children}
        </SectionBody>
      </div>
    </motion.section>
  );
}

/** The browse card's sections. The owner holds a row or a section to carry it, or a grip once arranging. */
export function CardArrangeList({
  zones,
  listId,
  className,
  canReorder,
  rubricOrder,
  onReorder,
  onReorderRubrics,
  onMoveItem,
  onChooseHeader,
  underlineLinks,
  onRetryFile,
  pdfZoneIds,
  markPdfBlocks,
}: {
  zones: CardZoneSection[];
  listId?: string;
  className?: string;
  canReorder: boolean;
  rubricOrder?: string[];
  onReorder?: (orderedIds: string[]) => void;
  onReorderRubrics?: (orderedKeys: string[]) => void;
  /** `section` is set when the row opens a new section: its heading and the new section order. */
  onMoveItem?: (itemId: string, zoneId: string, orderedIds: string[], section?: NewSection) => void;
  onChooseHeader?: (itemId: string) => void;
  underlineLinks: boolean;
  onRetryFile?: (itemId: string) => void;
  pdfZoneIds: string[] | null;
  markPdfBlocks: boolean;
}) {
  const value: ValueProps = { onChooseHeader, underlineLink: underlineLinks, onRetryFile };

  if (!canReorder) {
    const shown = pdfZoneIds ? zones.filter((zone) => pdfZoneIds.includes(zone.id)) : zones;
    if (shown.length === 0) return null;
    return (
      <div className={cn("relative w-full min-w-0", className)} data-card-chip-list={listId} data-card-content>
        {shown.map((zone, renderedIndex) => (
          <section
            key={zone.id}
            data-rubric={zone.id}
            data-pdf-block={markPdfBlocks ? "" : undefined}
            className={cn(
              "relative min-w-0 py-[18px]",
              zones.findIndex((entry) => entry.id === zone.id) < zones.length - 1 && "border-b border-[var(--rule)]",
            )}
          >
            <SectionBody number={sectionNumberLabel(renderedIndex)} title={zone.title} arranging={false}>
              {zone.rows.map((row) => (
                <div key={row.key} data-reorder-row={row.item?.id} className="relative">
                  <div className="min-w-0">
                    <EditorialValue row={row} {...value} />
                  </div>
                </div>
              ))}
            </SectionBody>
          </section>
        ))}
      </div>
    );
  }

  return (
    <ArrangeList
      zones={zones}
      listId={listId}
      className={className}
      rubricOrder={rubricOrder}
      onReorder={onReorder}
      onReorderRubrics={onReorderRubrics}
      onMoveItem={onMoveItem}
      value={value}
    />
  );
}

function ArrangeList({
  zones,
  listId,
  className,
  rubricOrder,
  onReorder,
  onReorderRubrics,
  onMoveItem,
  value,
}: {
  zones: CardZoneSection[];
  listId?: string;
  className?: string;
  rubricOrder?: string[];
  onReorder?: (orderedIds: string[]) => void;
  onReorderRubrics?: (orderedKeys: string[]) => void;
  onMoveItem?: (itemId: string, zoneId: string, orderedIds: string[], section?: NewSection) => void;
  value: ValueProps;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [held, setHeld] = useState<Held | null>(null);
  const [aim, setAim] = useState<Aim | null>(null);
  const [springs, setSprings] = useState(false);
  const [arranging, setArranging] = useState(false);
  const [chromeHost, setChromeHost] = useState<HTMLElement | null>(null);
  const heldRef = useRef<Held | null>(null);
  const aimRef = useRef<Aim | null>(null);
  const spareRef = useRef<CardZoneId | null>(null);
  const point = useRef({ x: 0, y: 0 });
  const frame = useRef(0);
  const pendingGap = useRef<{ gap: number; timer: number } | null>(null);
  const settleTimer = useRef<number | null>(null);
  const release = useRef<(() => void) | null>(null);
  const arrangingRef = useRef(false);
  const arrangeMarker = useRef(false);
  const suppressClick = useRef(false);
  const motionOk = prefersMotion();
  const onClient = useOnClient();

  const sensors = useSensors(
    useSensor(GripSensor, { activationConstraint: { distance: 3 } }),
    useSensor(HoldSensor, { activationConstraint: { delay: ARRANGE_HOLD_MS, tolerance: REORDER_SLOP_PX } }),
    useSensor(GripKeys),
  );

  const spare = SPARE_ZONES.find((id) => !zones.some((zone) => zone.id === id)) ?? null;
  useLayoutEffect(() => {
    spareRef.current = spare;
  }, [spare]);

  const clearPending = () => {
    if (pendingGap.current) window.clearTimeout(pendingGap.current.timer);
    pendingGap.current = null;
  };

  const aimAt = (next: Aim | null) => {
    if (sameAim(aimRef.current, next)) return;
    aimRef.current = next;
    setAim(next);
    tick();
  };

  const reaim = () => {
    const list = listRef.current;
    const current = heldRef.current;
    if (!list || !current) return;
    const box = list.getBoundingClientRect();
    const { x, y } = point.current;
    if (x < box.left - OFF_COLUMN_PX || x > box.right + OFF_COLUMN_PX) {
      clearPending();
      aimAt(null);
      return;
    }
    const localY = y - box.top;
    if (current.kind === "rubric") {
      aimAt({ kind: "rubric", index: rubricHit(list, localY, current.id) });
      return;
    }
    const hit = itemHit(list, localY, current.id);
    if ("fresh" in hit) {
      clearPending();
      return;
    }
    if ("zoneId" in hit) {
      clearPending();
      aimAt({ kind: "zone", zoneId: hit.zoneId, index: hit.index });
      return;
    }
    const gap = hit.gap;
    const now = aimRef.current;
    if (!spareRef.current || (now?.kind === "new" && now.gap === gap)) {
      clearPending();
      return;
    }
    if (pendingGap.current?.gap === gap) return;
    clearPending();
    pendingGap.current = {
      gap,
      timer: window.setTimeout(() => {
        pendingGap.current = null;
        if (heldRef.current) aimAt({ kind: "new", gap });
      }, GAP_DWELL_MS),
    };
  };

  const reaimSoon = () => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      reaim();
    });
  };

  const enterArrange = () => {
    if (arrangingRef.current) return;
    arrangingRef.current = true;
    setArranging(true);
    if (!arrangeMarker.current) {
      history.pushState({ compassArrange: 1 }, "");
      arrangeMarker.current = true;
    }
  };

  const leaveArrange = () => {
    arrangingRef.current = false;
    setArranging(false);
    if (!arrangeMarker.current) return;
    arrangeMarker.current = false;
    if (history.state?.compassArrange) history.back();
  };

  const start = (event: DragStartEvent) => {
    const raw = String(event.active.id);
    const id = raw.slice(raw.indexOf(":") + 1);
    const data = event.active.data.current as { kind: "item" | "rubric"; zoneId?: string } | undefined;
    const next: Held = data?.kind === "rubric" ? { kind: "rubric", id } : { kind: "item", id, zoneId: data?.zoneId ?? "" };
    if (event.activatorEvent instanceof PointerEvent) {
      point.current = { x: event.activatorEvent.clientX, y: event.activatorEvent.clientY };
    }
    if (settleTimer.current) window.clearTimeout(settleTimer.current);
    heldRef.current = next;
    aimRef.current = null;
    setHeld(next);
    setAim(null);
    setSprings(motionOk);
    suppressClick.current = true;
    enterArrange();
    tick();

    const track = (native: PointerEvent) => {
      point.current = { x: native.clientX, y: native.clientY };
      reaimSoon();
    };
    const scroller = listRef.current?.closest(".compass-card-scroll");
    document.addEventListener("touchmove", blockTouchMove, { passive: false, capture: true });
    document.addEventListener("pointermove", track, true);
    scroller?.addEventListener("scroll", reaimSoon, { passive: true });
    release.current = () => {
      document.removeEventListener("touchmove", blockTouchMove, true);
      document.removeEventListener("pointermove", track, true);
      scroller?.removeEventListener("scroll", reaimSoon);
    };
  };

  const move = (event: DragMoveEvent) => {
    if (!(event.activatorEvent instanceof KeyboardEvent)) return;
    const rect = event.active.rect.current.translated;
    if (!rect) return;
    point.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    reaim();
  };

  const apply = (current: Held, target: Aim) => {
    if (current.kind === "rubric") {
      if (target.kind !== "rubric") return;
      const from = zones.findIndex((zone) => zone.id === current.id);
      if (from < 0 || from === target.index) return;
      onReorderRubrics?.(applyRubricMove(rubricOrder, zones.map((zone) => zone.id), from, target.index));
      return;
    }
    const allIds = zones.flatMap((zone) => rowIds(zone));
    if (target.kind === "zone") {
      const ids = placeItemInZone(allIds, current.id, rowIds(zones.find((zone) => zone.id === target.zoneId)), target.index);
      if (target.zoneId !== current.zoneId) {
        onMoveItem?.(current.id, target.zoneId, ids);
        return;
      }
      if (ids.some((id, index) => id !== allIds[index])) onReorder?.(ids);
      return;
    }
    if (target.kind !== "new" || !spare) return;
    const visible: string[] = zones.map((zone) => zone.id);
    const order: string[] = [...visible.slice(0, target.gap), spare, ...visible.slice(target.gap)];
    const rest = (normalizeRubricOrder(rubricOrder) ?? []).filter((id) => !order.includes(id));
    onMoveItem?.(current.id, spare, placeItemInZone(allIds, current.id, [], 0), {
      title: NEW_FIELD_TITLE,
      order: [...order, ...rest],
    });
  };

  const finish = (commit: boolean) => {
    release.current?.();
    release.current = null;
    clearPending();
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = 0;
    const current = heldRef.current;
    const target = aimRef.current;
    heldRef.current = null;
    aimRef.current = null;
    if (commit && current && target) apply(current, target);
    setHeld(null);
    setAim(null);
    if (settleTimer.current) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => setSprings(false), SETTLE_MS);
  };

  useEffect(
    () => () => {
      release.current?.();
      clearPending();
      if (frame.current) cancelAnimationFrame(frame.current);
      if (settleTimer.current) window.clearTimeout(settleTimer.current);
      if (!arrangeMarker.current) return;
      arrangeMarker.current = false;
      if (history.state?.compassArrange) history.back();
    },
    [],
  );

  useEffect(() => {
    if (!arranging) return;
    const onPop = () => {
      arrangeMarker.current = false;
      arrangingRef.current = false;
      setArranging(false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [arranging]);

  // Arranging dims the header and everything around the list; Done floats on the still card frame.
  useLayoutEffect(() => {
    if (!arranging) return;
    const list = listRef.current;
    if (!list) return;
    const frameNode = list.closest(".compass-card-scroll")?.parentElement ?? null;
    setChromeHost(frameNode instanceof HTMLElement ? frameNode : null);
    const header = cardHeader(list);
    const column = list.parentElement;
    const nodes: HTMLElement[] = [];
    if (header) nodes.push(header);
    if (column) {
      for (const child of column.children) {
        if (child === list || !(child instanceof HTMLElement) || child.dataset.arrangeChrome) continue;
        nodes.push(child);
      }
    }
    for (const node of nodes) node.style.opacity = "0.45";
    return () => {
      for (const node of nodes) node.style.opacity = "";
    };
  }, [arranging]);

  const swallowClick = (event: MouseEvent<HTMLDivElement>) => {
    // While arranging, an accidental tap on a link or value must not open it. Done lives outside this list.
    if (!suppressClick.current && !arrangingRef.current) return;
    suppressClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  if (zones.length === 0) return null;

  const view = draftZones(zones, held, aim);
  const heldRow = held?.kind === "item" ? zones.flatMap((zone) => zone.rows).find((row) => row.item?.id === held.id) : null;
  const heldZone = held?.kind === "rubric" ? view.find((zone) => zone.id === held.id) : null;
  const landingZone = held?.kind === "item" ? (aim?.kind === "zone" ? aim.zoneId : aim?.kind === "new" ? NEW_FIELD_ID : held.zoneId) : null;

  return (
    <MotionConfig reducedMotion="user">
      <DndContext
        sensors={sensors}
        autoScroll={{ threshold: { x: 0, y: 0.18 } }}
        accessibility={{ restoreFocus: false }}
        onDragStart={start}
        onDragMove={move}
        onDragEnd={() => finish(true)}
        onDragCancel={() => finish(false)}
      >
        <div
          ref={listRef}
          className={cn(
            "relative w-full min-w-0 select-none [-webkit-touch-callout:none]",
            held && "touch-none",
            arranging && "pb-16",
            className,
          )}
          data-card-chip-list={listId}
          data-card-content
          data-arranging={arranging ? "" : undefined}
          data-no-swipe={held || arranging ? "" : undefined}
          onClickCapture={swallowClick}
          onContextMenu={(event) => event.preventDefault()}
        >
          {view.map((zone, index) => (
            <ArrangeSection
              key={zone.id}
              zone={zone}
              number={sectionNumberLabel(index)}
              last={index === view.length - 1}
              arranging={arranging}
              movable={zones.length >= 2}
              lifted={held?.kind === "rubric" && held.id === zone.id}
              entered={Boolean(held?.kind === "item" && landingZone === zone.id && (zone.fresh || held.zoneId !== zone.id))}
              springs={springs}
            >
              {zone.rows.map((row) => (
                <ArrangeRow
                  key={row.key}
                  row={row}
                  zoneId={zone.id}
                  arranging={arranging}
                  dimmed={held?.kind === "item"}
                  placeholder={held?.kind === "item" && row.item?.id === held.id}
                  springs={springs}
                  value={value}
                />
              ))}
            </ArrangeSection>
          ))}
          {arranging && chromeHost
            ? createPortal(
                <div data-arrange-chrome="" className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center">
                  <button
                    type="button"
                    data-arrange-done=""
                    className="pointer-events-auto t-body bg-sky px-5 py-2 text-[var(--ink)]"
                    onPointerDown={(event) => event.stopPropagation()}
                    onPointerUp={(event) => {
                      event.stopPropagation();
                      leaveArrange();
                    }}
                  >
                    Done
                  </button>
                </div>,
                chromeHost,
              )
            : null}
        </div>
        {onClient
          ? createPortal(
              <DragOverlay dropAnimation={motionOk ? DROP : null} zIndex={60}>
                {heldRow ? (
                  <motion.div
                    initial={{ scale: 1 }}
                    animate={{ scale: 1.04 }}
                    transition={SPRING}
                    className={cn("relative bg-white", LIFT_SHADOW)}
                  >
                    <div className="min-w-0 pr-7">
                      <EditorialValue row={heldRow} {...value} />
                    </div>
                    <span className="absolute top-0 right-0 flex size-6 items-center justify-center text-[var(--ink)]">
                      <GripHorizontal className="size-4" strokeWidth={1.5} aria-hidden />
                    </span>
                  </motion.div>
                ) : heldZone ? (
                  <motion.div
                    initial={{ scale: 1 }}
                    animate={{ scale: 1.03 }}
                    transition={SPRING}
                    className={cn("bg-white py-[18px]", LIFT_SHADOW)}
                  >
                    <SectionBody
                      number={sectionNumberLabel(view.findIndex((zone) => zone.id === heldZone.id))}
                      title={heldZone.title}
                      arranging
                    >
                      {heldZone.rows.map((row) => (
                        <div key={row.key} className="min-w-0">
                          <EditorialValue row={row} {...value} />
                        </div>
                      ))}
                    </SectionBody>
                  </motion.div>
                ) : null}
              </DragOverlay>,
              document.body,
            )
          : null}
      </DndContext>
    </MotionConfig>
  );
}
