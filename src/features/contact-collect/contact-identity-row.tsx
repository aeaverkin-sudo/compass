"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { HeroName, heroNameBoxPx } from "@/shared/components/hero-name";
import { MarkPlus } from "@/shared/components/mark-plus";
import { clampNameLines } from "@/shared/components/name-or-title-field";
import { cn } from "@/lib/utils";

const ROW = "grid grid-cols-[86px_minmax(0,1fr)] items-center gap-x-[14px]";
/** One `t-body` line. The empty Name caret sits on this hint. */
const NAME_HINT_LINE_PX = 15.5 * 1.45;
/** The photo square this row used to reserve. Letters still fit to the width beside it. */
const FORMER_PHOTO_PX = 128;
const FORMER_PHOTO_GAP_PX = 12;
/** Same cap on create, view, and edit. A long name wraps to a second line. */
const CONTACT_NAME_MAX_PX = 32;

function PhotoMark({ url }: { url: string | null }) {
  if (!url) return <MarkPlus />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="size-8 shrink-0 object-cover" />
  );
}

/** The New Contact name row: plus or a small photo, then the name, then a full-width rule. */
export function ContactIdentityRow({
  name,
  onNameChange,
  photoUrl,
  onPhoto,
  headerTitle,
  editing = false,
}: {
  name: string;
  onNameChange?: (value: string) => void;
  photoUrl: string | null;
  /** Create and edit open the existing picker. View leaves the mark alone. */
  onPhoto?: () => void;
  headerTitle?: string;
  editing?: boolean;
}) {
  const nameRowRef = useRef<HTMLDivElement>(null);
  const [nameMeasure, setNameMeasure] = useState(0);
  useLayoutEffect(() => {
    const node = nameRowRef.current;
    if (!node) return;
    const read = () => setNameMeasure(Math.max(0, node.clientWidth - FORMER_PHOTO_PX - FORMER_PHOTO_GAP_PX));
    read();
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const nameHint = name.length === 0;
  const nameColumn = nameMeasure > 0 ? nameMeasure : undefined;
  const oneNameLine = !editing && !name.includes("\n");
  const mark = <PhotoMark url={photoUrl} />;

  return (
    <div ref={nameRowRef} className="border-b border-[var(--rule)] pt-[18px] pb-[18px]">
      <div className={ROW}>
        {onPhoto ? (
          <button
            type="button"
            aria-label={photoUrl ? "Change photo" : "Add photo"}
            onClick={onPhoto}
            className="flex items-center justify-start border-0 bg-transparent p-0 text-[var(--ink)]"
          >
            {mark}
          </button>
        ) : (
          <span className="flex items-center justify-start text-[var(--ink)]">{mark}</span>
        )}
        <div className="relative min-w-0">
          <div
            className={cn("relative min-w-0", (nameHint || oneNameLine) && "flex flex-col justify-end")}
            style={oneNameLine ? { minHeight: heroNameBoxPx(CONTACT_NAME_MAX_PX) } : undefined}
          >
            {nameHint ? (
              <div aria-hidden className="pointer-events-none t-body text-[var(--placeholder)]">
                Name
              </div>
            ) : null}
            <div
              data-entry-name=""
              className={nameHint ? "absolute inset-x-0 bottom-0 overflow-x-hidden" : "min-w-0 overflow-x-hidden"}
              style={
                nameHint
                  ? { height: NAME_HINT_LINE_PX, width: nameColumn ?? "100%" }
                  : { width: nameColumn ?? "100%" }
              }
            >
              <HeroName
                value={name}
                onChange={onNameChange ? (value) => onNameChange(clampNameLines(value)) : undefined}
                placeholder="Name"
                locked={!onNameChange}
                ruled={Boolean(onNameChange)}
                roleBelow={Boolean(headerTitle)}
                measureWidthPx={nameColumn}
                measureHeightPx={FORMER_PHOTO_PX}
                maxPx={CONTACT_NAME_MAX_PX}
              />
            </div>
          </div>
          {headerTitle ? (
            <p
              className="m-0 line-clamp-3 min-w-0 shrink-0 overflow-hidden t-label uppercase text-[var(--grey)]"
              style={{ width: nameColumn ?? "100%" }}
            >
              {headerTitle}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
