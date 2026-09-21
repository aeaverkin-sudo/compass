"use client";

import type { MouseEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { itemDisplayValue, rowTypeLabel } from "@/shared/services/contact-item";
import type { ContactItem } from "@/shared/types";

export type ContactItemChipSize = "browse" | "compact";

type ContactItemChipProps = {
  item: ContactItem;
  size: ContactItemChipSize;
  className?: string;
};

function ContactItemChip({ item, size, className }: ContactItemChipProps) {
  const label = rowTypeLabel(item);
  const display = itemDisplayValue(item);
  const compact = size === "compact";
  const classNames = cn(
    "inline-flex max-w-full items-stretch rounded-[10px] bg-[oklch(97.5%_0.004_70)] text-left",
    compact ? "max-w-[220px] gap-1 px-2 py-1.5" : "max-w-[280px] gap-1.5 px-3 py-2",
    className,
  );

  const body = (
    <>
      {label ? (
        <span
          className={cn(
            "flex shrink-0 items-center font-light text-hairline",
            compact ? "text-[10px] leading-[1.25]" : "text-[12px] leading-[1.3]",
          )}
        >
          {label}
        </span>
      ) : null}
      <span
        className={cn(
          "flex min-w-0 items-center whitespace-normal break-words font-semibold text-foreground",
          compact ? "text-[12px] leading-[1.3]" : "text-[14px] leading-[1.35]",
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

  return (
    <div
      data-card-content
      className={cn(
        "flex w-full flex-col items-center",
        size === "browse" ? "mt-8 gap-2" : "mt-3 gap-1.5",
        className,
      )}
    >
      {items.map((item) => (
        <ContactItemChip key={item.id} item={item} size={size} />
      ))}
    </div>
  );
}
