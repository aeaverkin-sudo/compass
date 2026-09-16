"use client";

import { useMemo, useState } from "react";
import type { ContactItem } from "@/shared/types";
import { buildContactItem, isContactFilled, itemDisplayValue } from "@/features/portfolio/services/contact-item";
import { useLongPress } from "@/shared/hooks/use-long-press";
import { ContactIcon } from "./contact-icon";

interface LibraryPanelProps {
  library: ContactItem[];
  onAddItem: () => void;
  onUpdateItem: (id: string, data: Partial<ContactItem>) => void;
  onDeleteItem: (id: string) => void;
}

function MinusButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      data-no-toggle
      aria-label="Delete item"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="flex shrink-0 items-center justify-center rounded-full"
      style={{ width: 24, height: 24, background: "var(--hairline)" }}
    >
      <span
        className="block rounded-full"
        style={{ width: 9, height: 1.6, background: "var(--text-muted)" }}
      />
    </button>
  );
}

/** Two thin crossing lines — no circle, no label. */
function PlusGlyph() {
  const bar = {
    position: "absolute" as const,
    borderRadius: 2,
    background: "var(--glyph)",
  };
  return (
    <span className="relative block" style={{ width: 15, height: 15 }}>
      <span style={{ ...bar, left: 0, right: 0, top: 6.7, height: 1.6 }} />
      <span style={{ ...bar, top: 0, bottom: 0, left: 6.7, width: 1.6 }} />
    </span>
  );
}

function LibraryRow({
  item,
  last,
  onUpdate,
  onDelete,
}: {
  item: ContactItem;
  last: boolean;
  onUpdate: (data: Partial<ContactItem>) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(!isContactFilled(item));
  const press = useLongPress(() => setEditing(true));

  const pushValue = (raw: string) => {
    const built = buildContactItem(raw);
    onUpdate({ value: raw, type: built.type, url: built.url, label: built.label });
  };

  const rowStyle = {
    paddingBlock: 11,
    borderBottom: last ? "none" : "1px solid var(--hairline)",
  };

  if (editing) {
    return (
      <div
        className="flex items-center"
        style={rowStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          type="text"
          defaultValue={item.value}
          placeholder="link, email, phone, file…"
          className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none"
          style={{ color: "var(--foreground)" }}
          onChange={(e) => {
            if (e.target.value.trim()) pushValue(e.target.value);
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (text.trim()) pushValue(text.trim());
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") setEditing(false);
          }}
          onBlur={() => {
            if (item.value.trim()) setEditing(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5" style={rowStyle}>
      <span {...press} className="compass-press flex min-w-0 flex-1 items-center gap-2.5">
        <ContactIcon type={item.type} size={15} style={{ color: "var(--glyph)" }} />
        <span
          className="min-w-0 flex-1 truncate text-[13.5px] leading-snug"
          style={{ color: "var(--foreground)" }}
        >
          {itemDisplayValue(item)}
        </span>
      </span>
      <MinusButton onClick={onDelete} />
    </div>
  );
}

export function LibraryPanel({
  library,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
}: LibraryPanelProps) {
  const sorted = useMemo(() => [...library].sort((a, b) => a.order - b.order), [library]);
  const hasDraft = sorted.some((i) => !isContactFilled(i));

  return (
    <div
      data-wheel-scroll
      className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain scrollbar-hide"
      style={{ padding: "18px 20px 16px" }}
    >
      {sorted.map((item, index) => (
        <LibraryRow
          key={item.id}
          item={item}
          last={index === sorted.length - 1}
          onUpdate={(data) => onUpdateItem(item.id, data)}
          onDelete={() => onDeleteItem(item.id)}
        />
      ))}

      {!hasDraft && (
        <div className="flex shrink-0 flex-col items-center" style={{ paddingTop: 16, gap: 6 }}>
          <button
            type="button"
            data-no-toggle
            aria-label="Add an item"
            onClick={(e) => {
              e.stopPropagation();
              onAddItem();
            }}
            className="flex items-center justify-center p-1"
          >
            <PlusGlyph />
          </button>
          <span className="text-[10.5px] leading-none" style={{ color: "var(--text-muted)" }}>
            link, email, phone, file…
          </span>
        </div>
      )}
    </div>
  );
}
