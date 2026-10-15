"use client";

import {
  Fragment,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { cn } from "@/lib/utils";
import { openHomeScreenAttachmentPdf } from "@/shared/components/pdf-preview-host";
import { composeCard, orderCardZones, type CardDisplayRow } from "@/shared/services/card-zones";
import type { ContactItem } from "@/shared/types";
import { CardArrangeList, isHeaderRole, type NewSection } from "./card-arrange-list";

export type ContactItemChipSize = "browse" | "compact";

function prefersMotion() {
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function ContactItemChipRow({
  row,
  size,
  lifted,
  style,
  className,
  onChooseHeader,
}: {
  row: CardDisplayRow;
  size: ContactItemChipSize;
  lifted: boolean;
  style?: CSSProperties;
  className?: string;
  onChooseHeader?: (itemId: string) => void;
}) {
  const compact = size === "compact";
  const motion = typeof window !== "undefined" && prefersMotion();

  const line = row.axis ? `${row.axis} / ${row.value}` : row.value;
  const classNames = cn(
    "compass-type-value min-w-0 break-words text-left text-foreground select-none",
    lifted &&
      motion &&
      "origin-center scale-[1.03] rounded-full bg-sheet px-1.5 shadow-[0_10px_22px_rgba(20,20,20,0.14)] ring-1 ring-[rgba(20,20,20,0.28)] transition-[transform,box-shadow] duration-200 ease-out motion-reduce:scale-100 motion-reduce:transition-none motion-reduce:shadow-none",
    lifted && !motion && "rounded-full bg-sheet px-1.5 ring-1 ring-[rgba(20,20,20,0.28)]",
    className,
  );

  const body = line;

  if (!compact && row.item && row.url) {
    return (
      <a
        data-card-content
        data-preview-row={row.item.id}
        href={row.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event: MouseEvent) => {
          event.stopPropagation();
          if (row.item?.type === "pdf" && openHomeScreenAttachmentPdf(row.url, row.value || "PDF")) {
            event.preventDefault();
          }
        }}
        className={classNames}
        style={style}
      >
        {body}
      </a>
    );
  }

  return (
    <span
      data-card-content
      {...(row.item ? { "data-preview-row": row.item.id } : {})}
      onClick={
        isHeaderRole(row) && onChooseHeader && row.item
          ? (event) => {
              event.stopPropagation();
              onChooseHeader(row.item!.id);
            }
          : undefined
      }
      className={classNames}
      style={style}
    >
      {body}
    </span>
  );
}

export function ContactItemChipList({
  items,
  size,
  className,
  listId,
  onReorder,
  onReorderRubrics,
  onMoveItem,
  rubricOrder,
  rubricLabels,
  itemZones,
  canReorder = false,
  onChooseHeader,
  underlineLinks = false,
  publicToken,
  pdfZoneIds = null,
  markPdfBlocks = false,
  onRetryFile,
}: {
  items: ContactItem[];
  size: ContactItemChipSize;
  className?: string;
  listId?: string;
  onReorder?: (orderedIds: string[]) => void;
  onReorderRubrics?: (orderedKeys: string[]) => void;
  /** Drop a row into another section of this card, or a new one. The item itself is not changed. */
  onMoveItem?: (itemId: string, zoneId: string, orderedIds: string[], section?: NewSection) => void;
  /** Saved rubric order. Absent keeps Name, Company, Position, Web, … */
  rubricOrder?: string[];
  rubricLabels?: Record<string, string>;
  itemZones?: Record<string, string>;
  /** Owner card: a hold lifts a row or a section; arrange mode then shows grips that lift at once. */
  canReorder?: boolean;
  onChooseHeader?: (itemId: string) => void;
  /** Public read-only card. The owner card keeps plain values. */
  underlineLinks?: boolean;
  /** Public token: link taps go through /r so a distributed card still counts. */
  publicToken?: string;
  /** Print sheet: only these zones, in the card's own order. */
  pdfZoneIds?: string[] | null;
  markPdfBlocks?: boolean;
  /** Owner card only. File rows show Uploading… and Upload failed. */
  onRetryFile?: (itemId: string) => void;
}) {
  const compact = size === "compact";
  const listRef = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState({ top: false, bottom: false });
  const composed = composeCard(items, publicToken, { rubricLabels, itemZones });
  const orderedZones = orderCardZones(composed.zones, rubricOrder);
  const orderKey = orderedZones
    .flatMap((zone) => zone.rows.flatMap((row) => (row.item ? [row.item.id] : [])))
    .join("|");

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const next = {
      top: el.scrollTop > 2,
      bottom: max > 2 && el.scrollTop < max - 2,
    };
    setFade((current) =>
      current.top === next.top && current.bottom === next.bottom ? current : next,
    );
  }, [orderKey]);

  const syncFade = () => {
    const el = listRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const next = {
      top: el.scrollTop > 2,
      bottom: max > 2 && el.scrollTop < max - 2,
    };
    setFade((current) => (current.top === next.top && current.bottom === next.bottom ? current : next));
  };

  if (orderedZones.length === 0) return null;

  if (!compact) {
    return (
      <CardArrangeList
        zones={orderedZones}
        listId={listId}
        className={className}
        canReorder={canReorder}
        rubricOrder={rubricOrder}
        onReorder={onReorder}
        onReorderRubrics={onReorderRubrics}
        onMoveItem={onMoveItem}
        onChooseHeader={onChooseHeader}
        underlineLinks={underlineLinks}
        onRetryFile={onRetryFile}
        pdfZoneIds={pdfZoneIds}
        markPdfBlocks={markPdfBlocks}
      />
    );
  }
  return (
    <div className={cn("relative w-full", className)}>
      <div
        ref={listRef}
        data-card-content
        data-card-chip-list={listId}
        onScroll={syncFade}
        className="compass-preview-scroll mt-3 grid w-full min-w-0 grid-cols-[92px_minmax(0,1fr)] items-start gap-x-1.5 overflow-x-hidden"
      >
        {orderedZones.map((zone, zoneIndex) =>
          zone.rows.map((row, rowIndex) => {
            const zoneGap = zoneIndex > 0 && rowIndex === 0;
            const zoneEnd = rowIndex === zone.rows.length - 1;
            return (
              <Fragment key={row.key}>
                <span className={cn("pt-1 t-label whitespace-nowrap", zoneGap && "mt-3")}>
                  {rowIndex === 0 ? zone.title : null}
                </span>
                <ContactItemChipRow
                  row={row}
                  size={size}
                  lifted={false}
                  style={{
                    fontSize: 13,
                    fontWeight: 400,
                    letterSpacing: "-0.015em",
                    lineHeight: 1.35,
                    color: "#111",
                  }}
                  className={cn("min-w-0 t-meta text-[var(--ink)]", zoneGap && "mt-3")}
                  onChooseHeader={onChooseHeader}
                />
                {zoneEnd && zoneIndex < orderedZones.length - 1 ? (
                  <div className="col-span-2 mt-3 border-b border-[var(--rule)]" />
                ) : null}
              </Fragment>
            );
          }),
        )}
      </div>
      {fade.top ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-sheet to-transparent"
          style={{ height: 72 }}
        />
      ) : null}
      {fade.bottom ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-sheet to-transparent"
          style={{ height: 40 }}
        />
      ) : null}
    </div>
  );
}
