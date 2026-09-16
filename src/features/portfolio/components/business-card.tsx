"use client";

import { useRef, useState } from "react";
import type { Card, ContactItem, NextScanAddon } from "@/shared/types";
import {
  getCardItems,
  getNextScanAddons,
  itemDisplayValue,
} from "@/features/portfolio/services/contact-item";
import { useLongPress } from "@/shared/hooks/use-long-press";
import { ContactIcon } from "./contact-icon";
import { NextScanMenu } from "./next-scan-menu";
import { fileToDataUrl } from "@/shared/lib/utils";
import { MapPin, User } from "lucide-react";

interface BusinessCardProps {
  card: Card;
  library: ContactItem[];
  variant: "full" | "preview";
  onUpdate: (data: Partial<Card>) => void;
  onToggleEdit?: () => void;
}

/** Plain tap bubbles up to toggle layers; a 0.7s hold starts editing. */
function EditableText({
  value,
  placeholder,
  className,
  align = "center",
  onChange,
}: {
  value: string;
  placeholder: string;
  className: string;
  align?: "center" | "left";
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
        className={`w-full border-b border-[#1a1a1a]/15 bg-transparent outline-none ${
          align === "center" ? "text-center" : "text-left"
        } ${className}`}
      />
    );
  }

  return (
    <span {...press} className={`compass-press block ${className}`}>
      {value || placeholder}
    </span>
  );
}

function ContactPill({ item, small }: { item: ContactItem; small?: boolean }) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full bg-white ring-1 ring-[#e9e6e0] ${
        small ? "px-2 py-1 text-[10.5px]" : "px-2.5 py-1.5 text-[12px]"
      }`}
    >
      <ContactIcon
        type={item.type}
        size={small ? 11 : 13}
        className="shrink-0 text-[#a09a90]"
      />
      <span className="min-w-0 break-all leading-none text-[#2b2620]">
        {itemDisplayValue(item)}
      </span>
    </span>
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
  const compact = variant === "preview";

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

  const shell = (children: React.ReactNode) => (
    <div
      role="button"
      tabIndex={0}
      aria-label={compact ? "Expand card" : "Show fields"}
      onClick={handleCardTap}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggleEdit?.();
        }
      }}
      className={`compass-card relative w-full cursor-pointer rounded-[24px] bg-white text-left ${
        compact ? "px-4 py-4" : "px-5 py-7"
      }`}
    >
      <NextScanMenu addons={nextScanAddons} onSetAddons={setNextScanAddons} />
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
      <div
        className="flex min-h-[120px] flex-col items-center justify-center gap-4"
        data-no-toggle
      >
        <NameSetup onChange={(v) => onUpdate({ displayName: v })} />
      </div>,
    );
  }

  const avatar = (
    <span
      {...photoPress}
      className={`compass-press flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#f1efea] ${
        compact ? "h-[52px] w-[52px]" : "mx-auto h-[76px] w-[76px]"
      }`}
    >
      {card.photo ? (
        <img src={card.photo} alt="" className="h-full w-full object-cover" />
      ) : (
        <User size={compact ? 24 : 34} strokeWidth={1.4} className="text-[#b8b2a8]" />
      )}
    </span>
  );

  if (compact) {
    return shell(
      <>
        <div className="flex items-center gap-3 pr-9">
          {avatar}
          <div className="min-w-0 flex-1">
            <EditableText
              value={card.displayName}
              placeholder="Name"
              align="left"
              className="text-[16px] font-bold leading-tight tracking-tight text-[#1f1a14]"
              onChange={(v) => onUpdate({ displayName: v })}
            />
            <EditableText
              value={card.title}
              placeholder="Title"
              align="left"
              className="mt-0.5 text-[11.5px] leading-snug text-[#8d867b]"
              onChange={(v) => onUpdate({ title: v })}
            />
          </div>
        </div>

        {items.length > 0 && (
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {items.map((item) => (
              <ContactPill key={item.id} item={item} small />
            ))}
          </div>
        )}
      </>,
    );
  }

  return shell(
    <>
      {avatar}

      <div className="mt-3.5 text-center">
        <EditableText
          value={card.displayName}
          placeholder="Name"
          className="text-[20px] font-bold leading-tight tracking-tight text-[#1f1a14]"
          onChange={(v) => onUpdate({ displayName: v })}
        />
        <EditableText
          value={card.title}
          placeholder="Title"
          className="mt-1 text-[12px] leading-snug text-[#8d867b]"
          onChange={(v) => onUpdate({ title: v })}
        />
        {card.subtitle && (
          <EditableText
            value={card.subtitle}
            placeholder="Subtitle"
            className="text-[11px] leading-snug text-[#a8a29a]"
            onChange={(v) => onUpdate({ subtitle: v })}
          />
        )}
      </div>

      {items.length > 0 && (
        <div className="mt-5 flex flex-wrap justify-center gap-1.5">
          {items.map((item) => (
            <ContactPill key={item.id} item={item} />
          ))}
        </div>
      )}

      {card.location && (
        <div className="mt-5 flex items-center justify-center gap-1 text-[11px] text-[#b0aaa0]">
          <MapPin size={12} strokeWidth={1.5} />
          <EditableText
            value={card.location}
            placeholder="Add location"
            className="text-[11px] text-[#b0aaa0]"
            onChange={(v) => onUpdate({ location: v })}
          />
        </div>
      )}
    </>,
  );
}

function NameSetup({ onChange }: { onChange: (v: string) => void }) {
  const [value, setValue] = useState("");

  return (
    <div className="w-full px-2">
      <input
        value={value}
        placeholder="Add your first and last name"
        onChange={(e) => setValue(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) onChange(value.trim());
        }}
        onBlur={() => {
          if (value.trim()) onChange(value.trim());
        }}
        className="w-full border-b border-[#e3dfd8] bg-transparent pb-2 text-center text-[14px] text-[#2b2620] outline-none placeholder:text-[#a8a29a]"
      />
    </div>
  );
}
