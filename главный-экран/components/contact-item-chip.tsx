"use client";

import type { MouseEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { itemDisplayValue, rowTypeLabel } from "@/shared/services/contact-item";
import type { ContactItem } from "@/shared/types";

export type ContactItemChipSize = "browse" | "compact";

type ContactItemChipProps = {
  item: ContactItem;
  size: ContactItemChipSize;
  dense?: boolean;
  className?: string;
};

/** 3+ rows or a long wrap — pack to half the open browse rhythm. */
function isDenseList(items: ContactItem[]) {
  return (
    items.length >= 3 || items.some((item) => itemDisplayValue(item).length > 48)
  );
}

function ContactItemChip({ item, size, dense, className }: ContactItemChipProps) {
  const label = rowTypeLabel(item);
  const display = itemDisplayValue(item);
  const compact = size === "compact";
  const classNames = cn(
    "inline-flex max-w-full items-stretch bg-transparent text-left",
    compact
      ? dense
        ? "max-w-[220px] gap-1 px-2 py-0.5"
        : "max-w-[220px] gap-1 px-2 py-1.5"
      : dense
        ? "max-w-[280px] gap-1 px-3 py-1"
        : "max-w-[280px] gap-1.5 px-3 py-2",
    className,
  );

  const body = (
    <>
      {label ? (
        <span
          className={cn(
            "flex shrink-0 items-center font-light text-hairline",
            compact ? "text-[10px] leading-[1.2]" : "text-[12px] leading-[1.25]",
          )}
        >
          {label}
        </span>
      ) : null}
      <span
        className={cn(
          "flex min-w-0 items-center whitespace-normal break-words font-semibold text-foreground",
          compact
            ? "text-[12px] leading-[1.25]"
            : dense
              ? "text-[14px] leading-[1.2]"
              : "text-[14px] leading-[1.35]",
        )}
      >
        {display}
      </span>
    </>
  );

  if (item.url) {
    return (
      <a
        data-card-content
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event: MouseEvent) => event.stopPropagation()}
        className={classNames}
      >
        {body}
      </a>
    );
  }

  return (
    <span data-card-content className={classNames}>
      {body}
    </span>
  );
}

export function ContactItemChipList({
  items,
  size,
  className,
}: {
  items: ContactItem[];
  size: ContactItemChipSize;
  className?: string;
}): ReactNode {
  if (items.length === 0) return null;

  const dense = isDenseList(items);

  return (
    <div
      data-card-content
      className={cn(
        "flex w-full flex-col items-center",
        size === "browse"
          ? dense
            ? "mt-4 gap-1"
            : "mt-8 gap-2"
          : dense
            ? "mt-2 gap-0.5"
            : "mt-3 gap-1.5",
        className,
      )}
    >
      {items.map((item) => (
        <ContactItemChip key={item.id} item={item} size={size} dense={dense} />
      ))}
    </div>
  );
}
