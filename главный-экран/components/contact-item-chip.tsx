"use client";

import type { MouseEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { itemDisplayValue, rowTypeLabel } from "@/shared/services/contact-item";
import type { ContactItem } from "@/shared/types";

export type ContactItemChipSize = "browse" | "compact" | "catalog";

type ContactItemChipProps = {
  item: ContactItem;
  size: ContactItemChipSize;
  className?: string;
  onEdit?: () => void;
};

const SIZE: Record<
  ContactItemChipSize,
  { shell: string; label: string; value: string }
> = {
  browse: {
    shell: "max-w-[240px] px-4 py-2.5",
    label: "text-[11px] leading-none",
    value: "mt-1.5 text-[16px] font-semibold leading-[1.2]",
  },
  compact: {
    shell: "max-w-[150px] px-2.5 py-1.5",
    label: "text-[9px] leading-none",
    value: "mt-1 text-[12px] font-semibold leading-[1.2]",
  },
  catalog: {
    shell: "w-full max-w-none px-3.5 py-2",
    label: "text-[11px] leading-none",
    value: "mt-1 text-[15px] font-semibold leading-[1.25]",
  },
};

function ChipBody({ item, size }: { item: ContactItem; size: ContactItemChipSize }) {
  const label = rowTypeLabel(item);
  const display = itemDisplayValue(item);
  const tokens = SIZE[size];

  return (
    <>
      {label ? (
        <span className={cn("block truncate text-hint", tokens.label)}>{label}</span>
      ) : null}
      <span className={cn("block truncate text-foreground", tokens.value)}>{display}</span>
    </>
  );
}

function shellClass(size: ContactItemChipSize, className?: string) {
  return cn(
    "inline-flex min-w-0 flex-col items-start rounded-[12px] bg-[oklch(94%_0.008_70)] text-left",
    SIZE[size].shell,
    className,
  );
}

export function ContactItemChip({ item, size, className, onEdit }: ContactItemChipProps) {
  const classNames = shellClass(size, className);

  if (onEdit) {
    return (
      <button type="button" data-card-content onClick={onEdit} className={classNames}>
        <ChipBody item={item} size={size} />
      </button>
    );
  }

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
        <ChipBody item={item} size={size} />
      </a>
    );
  }

  return (
    <span data-card-content className={classNames}>
      <ChipBody item={item} size={size} />
    </span>
  );
}

export function ContactItemChipList({
  items,
  size,
  className,
}: {
  items: ContactItem[];
  size: Exclude<ContactItemChipSize, "catalog">;
  className?: string;
}): ReactNode {
  if (items.length === 0) return null;

  return (
    <div
      data-card-content
      className={cn(
        "flex w-full flex-wrap justify-center",
        size === "browse" ? "mt-8 gap-2.5" : "mt-3 gap-1.5",
        className,
      )}
    >
      {items.map((item) => (
        <ContactItemChip key={item.id} item={item} size={size} />
      ))}
    </div>
  );
}
