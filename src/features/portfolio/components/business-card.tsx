"use client";

import { useRef, useState } from "react";
import type { Card, ContactItem, NextScanAddon } from "@/shared/types";
import {
  getCardItems,
  getNextScanAddons,
  groupContactItems,
  itemDisplayValue,
} from "@/features/portfolio/services/contact-item";
import { useLongPress } from "@/shared/hooks/use-long-press";
import { ContactIcon } from "./contact-icon";
import { NextScanMenu } from "./next-scan-menu";
import { fileToDataUrl } from "@/shared/lib/utils";

interface BusinessCardProps {
  card: Card;
  library: ContactItem[];
  variant: "full" | "compact";
  onUpdate: (data: Partial<Card>) => void;
  onToggleEdit?: () => void;
}

/** Plain tap bubbles up to switch layers; a 0.7s hold starts editing. */
function EditableText({
  value,
  placeholder,
  className,
  align,
  color,
  onChange,
}: {
  value: string;
  placeholder: string;
  className: string;
  align: "center" | "left";
  color: string;
  onChange: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const press = useLongPress(() => setEditing(true));

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setEditing(false)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Escape") setEditing(false);
        }}
        className={`w-full bg-transparent outline-none ${
          align === "center" ? "text-center" : "text-left"
        } ${className}`}
        style={{ borderBottom: "1px solid var(--hairline)", color }}
      />
    );
  }

  if (!value.trim()) {
    return (
      <span {...press} className={`compass-press block ${className}`} style={{ color: "var(--text-muted)" }}>
        {placeholder}
      </span>
    );
  }

  return (
    <span {...press} className={`compass-press block ${className}`} style={{ color }}>
      {value}
    </span>
  );
}

function AvatarSilhouette({ size }: { size: number }) {
  return (
    <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="oklch(88% 0.01 70)">
      <circle cx="12" cy="8" r="4.1" />
      <path d="M3.6 21c0-4.3 3.8-6.8 8.4-6.8s8.4 2.5 8.4 6.8z" />
    </svg>
  );
}

function Chip({ item, compact }: { item: ContactItem; compact: boolean }) {
  return (
    <span
      className="inline-flex max-w-full items-center rounded-[10px]"
      style={{
        height: compact ? 25 : 32,
        paddingInline: compact ? 9 : 12,
        borderRadius: compact ? 8 : 10,
        gap: compact ? 5 : 7,
        background: "var(--chip)",
      }}
    >
      <ContactIcon
        type={item.type}
        size={compact ? 11 : 12.5}
        style={{ color: "var(--glyph)" }}
      />
      <span
        className="min-w-0 truncate leading-none"
        style={{
          fontSize: compact ? 10.5 : 12.5,
          color: "var(--foreground)",
        }}
      >
        {itemDisplayValue(item)}
      </span>
    </span>
  );
}

function ChipGroups({ items, compact }: { items: ContactItem[]; compact: boolean }) {
  const groups = groupContactItems(items);
  if (groups.length === 0) return null;

  return (
    <div
      className="flex flex-col items-center"
      style={{ gap: compact ? 7 : 13 }}
    >
      {groups.map((group) => (
        <div
          key={group.key}
          className="flex flex-wrap justify-center"
          style={{ gap: compact ? 5 : 7 }}
        >
          {group.items.map((item) => (
            <Chip key={item.id} item={item} compact={compact} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function BusinessCard({
  card,
  library,
  variant,
  onUpdate,
  onToggleEdit,
}: BusinessCardProps) {
  const photoRef = useRef<HTMLInputElement>(null);
  const compact = variant === "compact";

  const items = getCardItems(card, library);
  const nextScanAddons = getNextScanAddons(card);
  const photoPress = useLongPress(() => photoRef.current?.click());

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onUpdate({ photo: await fileToDataUrl(file) });
    e.target.value = "";
  };

  const setNextScanAddons = (addons: NextScanAddon[]) => {
    onUpdate({ nextScanAddons: addons, updatedAt: new Date().toISOString() });
  };

  const handleCardTap = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest("[data-no-toggle]") || t.closest("input")) return;
    onToggleEdit?.();
  };

  const avatarSize = compact ? 38 : 72;

  const avatar = (
    <span
      {...photoPress}
      className="compass-press flex shrink-0 items-center justify-center overflow-hidden rounded-full"
      style={{
        width: avatarSize,
        height: avatarSize,
        background: card.photo
          ? undefined
          : "linear-gradient(155deg, oklch(45% 0.03 60), oklch(28% 0.02 55))",
      }}
    >
      {card.photo ? (
        <img src={card.photo} alt="" className="h-full w-full object-cover" />
      ) : (
        <AvatarSilhouette size={avatarSize} />
      )}
    </span>
  );

  const shell = (children: React.ReactNode, padding: string, radius: string) => (
    <div
      role="button"
      tabIndex={0}
      aria-label={compact ? "Expand card" : "Open library"}
      onClick={handleCardTap}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggleEdit?.();
        }
      }}
      className="compass-card relative w-full cursor-pointer text-left"
      style={{
        background: "var(--sheet)",
        padding,
        borderRadius: radius,
        minHeight: compact ? 112 : undefined,
      }}
    >
      {!compact && (
        <NextScanMenu addons={nextScanAddons} onSetAddons={setNextScanAddons} />
      )}
      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePhoto}
      />
      {children}
    </div>
  );

  if (!card.displayName.trim()) {
    return shell(
      <div data-no-toggle className="flex min-h-[104px] items-center justify-center px-2">
        <NameSetup onSubmit={(v) => onUpdate({ displayName: v })} />
      </div>,
      "18px 20px",
      "22px",
    );
  }

  if (compact) {
    return shell(
      <>
        <div className="flex items-center" style={{ gap: 10 }}>
          {avatar}
          <div className="min-w-0 flex-1">
            <EditableText
              value={card.displayName}
              placeholder="Name"
              align="left"
              color="var(--foreground)"
              className="text-[14.5px] font-semibold leading-tight tracking-[-0.01em]"
              onChange={(v) => onUpdate({ displayName: v })}
            />
            <EditableText
              value={card.title}
              placeholder="Role or title"
              align="left"
              color="var(--text-muted)"
              className="text-[10.5px] leading-snug"
              onChange={(v) => onUpdate({ title: v })}
            />
          </div>
          <NextScanMenu
            compact
            addons={nextScanAddons}
            onSetAddons={setNextScanAddons}
          />
        </div>

        {items.length > 0 && (
          <div style={{ marginTop: 11 }}>
            <ChipGroups items={items} compact />
          </div>
        )}
      </>,
      "14px 16px 12px",
      "22px 22px 14px 14px",
    );
  }

  return shell(
    <>
      <div className="flex justify-center">{avatar}</div>

      <div className="text-center" style={{ marginTop: 10 }}>
        <EditableText
          value={card.displayName}
          placeholder="Name"
          align="center"
          color="var(--foreground)"
          className="text-[18px] font-semibold leading-tight tracking-[-0.01em]"
          onChange={(v) => onUpdate({ displayName: v })}
        />
        <div style={{ marginTop: 2 }}>
          <EditableText
            value={card.title}
            placeholder="Role or title"
            align="center"
            color="var(--text-muted)"
            className="text-[12px] leading-snug"
            onChange={(v) => onUpdate({ title: v })}
          />
        </div>
      </div>

      {items.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <ChipGroups items={items} compact={false} />
        </div>
      )}
    </>,
    "18px 20px",
    "22px",
  );
}

function NameSetup({ onSubmit }: { onSubmit: (v: string) => void }) {
  const [value, setValue] = useState("");

  const commit = () => {
    if (value.trim()) onSubmit(value.trim());
  };

  return (
    <input
      value={value}
      placeholder="Add your first and last name"
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
      onBlur={commit}
      className="w-full bg-transparent pb-2 text-center text-[14px] outline-none"
      style={{ borderBottom: "1px solid var(--hairline)", color: "var(--foreground)" }}
    />
  );
}
