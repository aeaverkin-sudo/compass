"use client";

import type { MouseEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { itemDisplayValue } from "@/shared/services/contact-item";
import type { ContactItem } from "@/shared/types";

export type ContactItemChipSize = "browse" | "compact";

type ContactItemChipProps = {
  item: ContactItem;
  size: ContactItemChipSize;
  className?: string;
};

function ContactItemChip({ item, size, className }: ContactItemChipProps) {
  const display = itemDisplayValue(item);
  const classNames = cn(
    "inline-flex max-w-full items-center rounded-[10px] bg-[oklch(94%_0.008_70)] text-foreground",
    size === "compact" ? "h-[25px] px-2 text-[11px] leading-none" : "h-8 px-3 text-[13px] leading-none",
    className,
  );

  const body = <span className="truncate">{display}</span>;

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
        "flex w-full flex-wrap justify-center",
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
