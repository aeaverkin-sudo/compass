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

export function BusinessCard({
  card,
  library,
  variant,
  onUpdate,
  onToggleEdit,
}: BusinessCardProps) {
  const photoRef = useRef<HTMLInputElement>(null);
  const [editingField, setEditingField] = useState<string | null>(null);

  const compact = variant === "preview";
  const items = getCardItems(card, library);
  const groups = groupContactItems(items);
  const nextScanAddons = getNextScanAddons(card);

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
    if (
      t.closest("[data-editable]") ||
      t.closest("[data-no-toggle]") ||
      t.closest("button") ||
      t.closest("input")
    ) {
      return;
    }
    onToggleEdit?.();
  };

  const renderEditable = (
    field: keyof Card,
    value: string,
    className: string,
    placeholder: string,
  ) => {
    if (editingField === field) {
      return (
        <input
          data-editable
          autoFocus
          value={value}
          placeholder={placeholder}
          onChange={(e) => onUpdate({ [field]: e.target.value })}
          onBlur={() => setEditingField(null)}
          onClick={(e) => e.stopPropagation()}
          className={`w-full border-b border-[#1a1a1a]/15 bg-transparent text-center outline-none ${className}`}
        />
      );
    }
    return (
      <button
        type="button"
        data-editable
        onClick={(e) => {
          e.stopPropagation();
          setEditingField(field);
        }}
        className={className}
      >
        {value || placeholder}
      </button>
    );
  };

  const shell = (children: React.ReactNode) => (
    <div
      role="button"
      tabIndex={0}
      aria-label={compact ? "Expand card" : "Open fields"}
      onClick={handleCardTap}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggleEdit?.();
        }
      }}
      className={`compass-card relative w-full cursor-pointer overflow-hidden rounded-[26px] bg-white/95 text-left backdrop-blur-xl ${
        compact ? "px-4 py-3.5" : "px-5 py-6"
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
        {renderEditable(
          "displayName",
          card.displayName,
          "text-lg font-semibold text-[#1a1a1a]",
          "Add your name",
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            photoRef.current?.click();
          }}
          className="rounded-full bg-[#f4f4f4] px-4 py-2 text-[13px] text-[#555]"
        >
          Add photo
        </button>
      </div>,
    );
  }

  const photo = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        photoRef.current?.click();
      }}
      className={compact ? "shrink-0" : "mx-auto block"}
    >
      <img
        src={card.photo}
        alt=""
        className={`rounded-full object-cover ring-1 ring-black/5 ${
          compact ? "h-[58px] w-[58px]" : "h-[96px] w-[96px]"
        }`}
      />
    </button>
  );

  const identity = (
    <>
      {renderEditable(
        "displayName",
        card.displayName,
        compact
          ? "block text-[16px] font-bold leading-tight tracking-tight text-[#1a1a1a]"
          : "block w-full text-[23px] font-bold leading-tight tracking-tight text-[#1a1a1a]",
        "Name",
      )}
      {renderEditable(
        "title",
        card.title,
        compact
          ? "mt-0.5 block text-[12px] leading-snug text-[#5a5a5a]"
          : "mt-1.5 block w-full text-[14px] leading-snug text-[#5a5a5a]",
        "Title",
      )}
      {renderEditable(
        "subtitle",
        card.subtitle,
        compact
          ? "block text-[11px] leading-snug text-[#8a8a8a]"
          : "block w-full text-[13px] leading-snug text-[#8a8a8a]",
        "Subtitle",
      )}
      {renderEditable(
        "description",
        card.description,
        compact
          ? "block text-[10px] leading-snug text-[#aaa]"
          : "mt-0.5 block w-full text-[11px] leading-snug text-[#aaa]",
        "Tagline",
      )}
    </>
  );

  if (compact) {
    return shell(
      <>
        <div className="flex items-start gap-3 pr-9">
          {photo}
          <div className="min-w-0 flex-1">{identity}</div>
        </div>

        {items.length > 0 && (
          <div className="mt-3 space-y-2 border-t border-[#f1f1f1] pt-3">
            {groups.map((group) => (
              <div key={group.key} className="flex flex-wrap gap-1.5">
                {group.items.map((item) => (
                  <span
                    key={item.id}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[#f6f6f4] px-2.5 py-1.5 text-[11px] font-medium leading-none text-[#2a2a2a]"
                  >
                    <ContactIcon
                      type={item.type}
                      size={12}
                      className="shrink-0 text-[#8a8a8a]"
                    />
                    <span className="min-w-0 break-all">{itemDisplayValue(item)}</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}

        {card.location && (
          <div className="mt-2.5 flex items-center gap-1 text-[10px] text-[#aaa]">
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
      <div className="mt-3.5 text-center">{identity}</div>

      {groups.length > 0 && (
        <div className="mt-5 space-y-3.5">
          {groups.map((group) => (
            <div key={group.key}>
              <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.09em] text-[#b6b6b6]">
                {CONTACT_GROUP_LABELS[group.key]}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {group.items.map((item) => (
                  <a
                    key={item.id}
                    href={item.url || undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className={`flex items-start gap-2.5 rounded-2xl bg-[#faf9f7] p-3 ring-1 ring-[#f0efec] transition-colors active:bg-[#f4f3f0] ${
                      group.key === "files" || group.items.length === 1
                        ? "col-span-2"
                        : ""
                    }`}
                  >
                    <ContactIcon
                      type={item.type}
                      size={17}
                      className="mt-0.5 shrink-0 text-[#4a4a4a]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[10px] leading-none text-[#a3a3a3]">
                        {typeLabel(item.type)}
                      </span>
                      <span className="mt-1 block break-words text-[13px] font-semibold leading-snug text-[#1a1a1a]">
                        {itemDisplayValue(item)}
                      </span>
                    </span>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 flex items-center justify-center gap-1 text-[11px] text-[#b0b0b0]">
        <MapPin size={12} strokeWidth={1.5} />
        {renderEditable(
          "location",
          card.location,
          "text-[11px] text-[#b0b0b0]",
          "Add location",
        )}
      </div>
    </>,
  );
}
