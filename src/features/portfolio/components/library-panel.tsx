"use client";

import { useMemo, useRef, useState } from "react";
import type { ContactItem } from "@/shared/types";
import {
  buildContactItem,
  isContactFilled,
  itemDisplayValue,
} from "@/features/portfolio/services/contact-item";
import { useLongPress } from "@/shared/hooks/use-long-press";
import { ContactIcon } from "./contact-icon";

const MAX_PDF_BYTES = 4 * 1024 * 1024;

interface LibraryPanelProps {
  items: ContactItem[];
  mode: "peek" | "edit";
  /** Item ids currently shown on this card's chips. */
  activeIds: string[];
  onAddItem: () => void;
  onAttachFile: (file: File, itemId?: string) => void | Promise<void>;
  onUpdateItem: (id: string, data: Partial<ContactItem>) => void;
  onToggleOnCard: (itemId: string) => void;
}

function CardToggleButton({ onCard, onClick }: { onCard: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      data-no-toggle
      aria-label={onCard ? "Remove from card" : "Add to card"}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="flex shrink-0 items-center justify-center rounded-full text-[18px] font-light leading-none"
      style={{
        width: 24,
        height: 24,
        background: onCard ? "var(--hairline)" : "transparent",
        color: "var(--foreground)",
      }}
    >
      {onCard ? "−" : "+"}
    </button>
  );
}

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
  showDivider,
  mode,
  onCard,
  onAttachFile,
  onUpdate,
  onToggleOnCard,
}: {
  item: ContactItem;
  showDivider: boolean;
  mode: "peek" | "edit";
  onCard: boolean;
  onAttachFile: (file: File, itemId?: string) => void | Promise<void>;
  onUpdate: (data: Partial<ContactItem>) => void;
  onToggleOnCard: () => void;
}) {
  const [editing, setEditing] = useState(mode === "edit" && !isContactFilled(item));
  const press = useLongPress(() => {
    if (mode === "edit") setEditing(true);
  });

  const pushValue = (raw: string) => {
    const built = buildContactItem(raw);
    onUpdate({ value: built.value, type: built.type, url: built.url, label: built.label });
  };

  const attachPdf = async (file: File) => {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return;
    if (file.size > MAX_PDF_BYTES) {
      window.alert("PDF must be under 4 MB.");
      return;
    }
    await onAttachFile(file, item.id);
    setEditing(false);
  };

  const rowStyle = {
    paddingBlock: 11,
    borderBottom: showDivider ? "1px solid var(--hairline)" : "none",
  };

  if (mode === "edit" && editing) {
    return (
      <div
        className="flex items-center"
        style={rowStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          type="text"
          defaultValue={item.value.startsWith("data:") ? item.label : item.value}
          placeholder="link, email, phone, file…"
          className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none"
          style={{ color: "var(--foreground)" }}
          onChange={(e) => {
            if (e.target.value.trim()) pushValue(e.target.value);
          }}
          onPaste={(e) => {
            const file = e.clipboardData.files[0];
            if (file) {
              e.preventDefault();
              void attachPdf(file);
              return;
            }
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

  if (!isContactFilled(item)) return null;

  return (
    <div className="flex items-center gap-2.5" style={rowStyle}>
      <span
        {...(mode === "edit" ? press : {})}
        className={`flex min-w-0 flex-1 items-center gap-2.5 ${mode === "edit" ? "compass-press" : ""}`}
      >
        <ContactIcon type={item.type} size={15} style={{ color: "var(--glyph)" }} />
        <span
          className="min-w-0 flex-1 truncate text-[13.5px] leading-snug"
          style={{
            color: onCard ? "var(--foreground)" : "var(--text-muted)",
            fontWeight: onCard ? 500 : 400,
          }}
        >
          {itemDisplayValue(item)}
        </span>
      </span>
      {mode === "edit" && (
        <CardToggleButton onCard={onCard} onClick={onToggleOnCard} />
      )}
    </div>
  );
}

export function LibraryPanel({
  items,
  mode,
  activeIds,
  onAddItem,
  onAttachFile,
  onUpdateItem,
  onToggleOnCard,
}: LibraryPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const active = useMemo(() => new Set(activeIds), [activeIds]);
  const sorted = useMemo(() => [...items].sort((a, b) => a.order - b.order), [items]);
  const filled = sorted.filter(isContactFilled);
  const hasDraft = sorted.some((i) => !isContactFilled(i));

  const openFilePicker = () => fileRef.current?.click();
  const plusPress = useLongPress(openFilePicker);

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      window.alert("Only PDF files are supported.");
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      window.alert("PDF must be under 4 MB.");
      return;
    }
    await onAttachFile(file);
  };

  return (
    <div
      data-wheel-scroll
      className={`flex min-h-0 flex-1 flex-col overscroll-contain scrollbar-hide ${
        mode === "peek" ? "overflow-hidden" : "overflow-y-auto"
      }`}
      style={{ padding: "18px 20px 16px" }}
    >
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={handleFileInput}
      />

      {sorted.map((item, index) => {
        const filledAfter = sorted.slice(index + 1).some(isContactFilled);
        return (
          <LibraryRow
            key={item.id}
            item={item}
            mode={mode}
            onCard={active.has(item.id)}
            showDivider={isContactFilled(item) && filledAfter}
            onAttachFile={onAttachFile}
            onUpdate={(data) => onUpdateItem(item.id, data)}
            onToggleOnCard={() => onToggleOnCard(item.id)}
          />
        );
      })}

      {filled.length === 0 && mode === "peek" && (
        <p
          className="pt-1 text-center text-[12px]"
          style={{ color: "var(--text-muted)" }}
        >
          Tap to open library and add items
        </p>
      )}

      {mode === "edit" && !hasDraft && (
        <div className="flex shrink-0 flex-col items-center" style={{ paddingTop: 16, gap: 6 }}>
          <button
            type="button"
            data-no-toggle
            aria-label="Add library item"
            className="flex items-center justify-center p-1"
            onClick={(e) => {
              plusPress.onClick(e);
              if (e.defaultPrevented) return;
              e.stopPropagation();
              onAddItem();
            }}
            onPointerDown={plusPress.onPointerDown}
            onPointerMove={plusPress.onPointerMove}
            onPointerUp={plusPress.onPointerUp}
            onPointerCancel={plusPress.onPointerCancel}
            onPointerLeave={plusPress.onPointerLeave}
            onContextMenu={plusPress.onContextMenu}
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
