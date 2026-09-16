"use client";

import { useRef, useState } from "react";
import type { Card, ContactItem, NextScanAddon } from "@/shared/types";
import {
  CONTACT_GROUP_LABELS,
  getCardItems,
  getNextScanAddons,
  groupContactItems,
  itemDisplayValue,
  typeLabel,
} from "@/features/portfolio/services/contact-item";
import { useLongPress } from "@/shared/hooks/use-long-press";
import { ContactIcon } from "./contact-icon";
import { NextScanMenu } from "./next-scan-menu";
import { fileToDataUrl } from "@/shared/lib/utils";
import { MapPin } from "lucide-react";

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
  const groups = groupContactItems(items);
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
      className={`compass-card relative w-full cursor-pointer rounded-[26px] bg-white text-left ${
        compact ? "px-4 py-4" : "px-5 py-5"
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

  if (!card.photo) {
    return shell(
      <div className="flex min-h-[180px] flex-col items-center justify-center gap-3">
        <EditableText
          value={card.displayName}
          placeholder="Hold to add your name"
          className="text-lg font-semibold text-[#1a1a1a]"
          onChange={(v) => onUpdate({ displayName: v })}
        />
        <button
          type="button"
          data-no-toggle
          onClick={(e) => {
            e.stopPropagation();
            photoRef.current?.click();
          }}
          className="rounded-full bg-[#f4f4f2] px-4 py-2 text-[13px] text-[#555]"
        >
          Add photo
        </button>
      </div>,
    );
  }

  const photo = (
    <span
      {...photoPress}
      className={`compass-press block overflow-hidden rounded-full ring-1 ring-black/5 ${
        compact ? "h-[62px] w-[62px] shrink-0" : "mx-auto h-[92px] w-[92px]"
      }`}
    >
      <img src={card.photo} alt="" className="h-full w-full object-cover" />
    </span>
  );

  if (compact) {
    return shell(
      <>
        <div className="flex items-center gap-3 pr-9">
          {photo}
          <div className="min-w-0 flex-1">
            <EditableText
              value={card.displayName}
              placeholder="Name"
              align="left"
              className="text-[17px] font-bold leading-tight tracking-tight text-[#1a1a1a]"
              onChange={(v) => onUpdate({ displayName: v })}
            />
            <EditableText
              value={card.title}
              placeholder="Title"
              align="left"
              className="mt-0.5 text-[12.5px] leading-snug text-[#5a5a5a]"
              onChange={(v) => onUpdate({ title: v })}
            />
            <EditableText
              value={card.subtitle}
              placeholder="Subtitle"
              align="left"
              className="text-[11.5px] leading-snug text-[#8a8a8a]"
              onChange={(v) => onUpdate({ subtitle: v })}
            />
          </div>
        </div>

        {items.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[#f1f1f1] pt-3">
            {items.map((item) => (
              <span
                key={item.id}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[#f6f6f4] px-3 py-1.5 text-[12.5px] font-medium leading-snug text-[#1a1a1a]"
              >
                <ContactIcon
                  type={item.type}
                  size={13}
                  className="shrink-0 text-[#8a8a8a]"
                />
                <span className="min-w-0 break-all">{itemDisplayValue(item)}</span>
              </span>
            ))}
          </div>
        )}

        {card.location && (
          <div className="mt-2.5 flex items-center gap-1 text-[10.5px] text-[#aaa]">
            <MapPin size={11} strokeWidth={1.5} />
            {card.location}
          </div>
        )}
      </>,
    );
  }

  return shell(
    <>
      {photo}

      <div className="mt-3 text-center">
        <EditableText
          value={card.displayName}
          placeholder="Name"
          className="text-[22px] font-bold leading-tight tracking-tight text-[#1a1a1a]"
          onChange={(v) => onUpdate({ displayName: v })}
        />
        <EditableText
          value={card.title}
          placeholder="Title"
          className="mt-1 text-[14px] leading-snug text-[#5a5a5a]"
          onChange={(v) => onUpdate({ title: v })}
        />
        <EditableText
          value={card.subtitle}
          placeholder="Subtitle"
          className="text-[12.5px] leading-snug text-[#8a8a8a]"
          onChange={(v) => onUpdate({ subtitle: v })}
        />
        <EditableText
          value={card.description}
          placeholder="Tagline"
          className="text-[11px] leading-snug text-[#b0b0b0]"
          onChange={(v) => onUpdate({ description: v })}
        />
      </div>

      {groups.length > 0 && (
        <div className="mt-4 space-y-3">
          {groups.map((group) => (
            <div key={group.key}>
              <p className="mb-1.5 px-1 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[#bcbcbc]">
                {CONTACT_GROUP_LABELS[group.key]}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {group.items.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-start gap-2.5 rounded-2xl bg-[#faf9f7] px-3 py-2.5 ring-1 ring-[#f0efec] ${
                      group.key === "files" || group.items.length === 1
                        ? "col-span-2"
                        : ""
                    }`}
                  >
                    <ContactIcon
                      type={item.type}
                      size={16}
                      className="mt-[3px] shrink-0 text-[#4a4a4a]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[9.5px] leading-none text-[#a8a8a8]">
                        {typeLabel(item.type)}
                      </span>
                      <span className="mt-1 block break-words text-[13px] font-semibold leading-snug text-[#1a1a1a]">
                        {itemDisplayValue(item)}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center justify-center gap-1 text-[11px] text-[#b0b0b0]">
        <MapPin size={12} strokeWidth={1.5} />
        <EditableText
          value={card.location}
          placeholder="Add location"
          className="text-[11px] text-[#b0b0b0]"
          onChange={(v) => onUpdate({ location: v })}
        />
      </div>
    </>,
  );
}
