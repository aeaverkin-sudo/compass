"use client";

import { useRef, useState } from "react";
import type { Card, ContactItem, NextScanAddon } from "@/shared/types";
import {
  getCardItems,
  getNextScanAddons,
  isCardReady,
  itemDisplayValue,
  itemFullLine,
  typeLabel,
} from "@/features/portfolio/services/contact-item";
import { ContactIcon } from "./contact-icon";
import { NextScanMenu } from "./next-scan-menu";
import { fileToDataUrl } from "@/shared/lib/utils";
import { MapPin, ChevronDown } from "lucide-react";

interface BusinessCardProps {
  card: Card;
  library: ContactItem[];
  variant: "full" | "preview";
  onUpdate: (data: Partial<Card>) => void;
  onCloseEdit?: () => void;
  onBlankAreaTap?: () => void;
}

function ContactCell({
  item,
  fullWidth,
  onOpen,
}: {
  item: ContactItem;
  fullWidth?: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      data-contact-item
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      className={`flex min-h-[52px] items-start gap-2 rounded-xl border border-[#efefef] bg-white p-2.5 text-left ${
        fullWidth ? "col-span-2" : ""
      }`}
    >
      <ContactIcon type={item.type} size={16} className="mt-0.5 shrink-0 text-[#444]" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-[#999]">{typeLabel(item.type)}</p>
        <p className="break-words text-[12px] font-semibold leading-snug text-[#1a1a1a]">
          {itemDisplayValue(item)}
        </p>
      </div>
    </button>
  );
}

export function BusinessCard({
  card,
  library,
  variant,
  onUpdate,
  onCloseEdit,
  onBlankAreaTap,
}: BusinessCardProps) {
  const photoRef = useRef<HTMLInputElement>(null);
  const [editingField, setEditingField] = useState<string | null>(null);

  const items = getCardItems(card, library);
  const ready = isCardReady(card);
  const pdfItems = items.filter((i) => i.type === "pdf");
  const gridItems = items.filter((i) => i.type !== "pdf");

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onUpdate({ photo: await fileToDataUrl(file) });
    e.target.value = "";
  };

  const openContact = (item: ContactItem) => {
    if (item.url) window.open(item.url, "_blank", "noopener,noreferrer");
  };

  const nextScanAddons = getNextScanAddons(card);

  const setNextScanAddons = (addons: NextScanAddon[]) => {
    onUpdate({ nextScanAddons: addons, updatedAt: new Date().toISOString() });
  };

  const handleBlankTap = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (
      t.closest("[data-editable]") ||
      t.closest("[data-contact-item]") ||
      t.closest("button") ||
      t.closest("input")
    ) {
      return;
    }
    onBlankAreaTap?.();
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
          className={`border-b border-[#1a1a1a]/20 bg-transparent outline-none ${className}`}
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

  if (!card.displayName.trim() && !card.photo) {
    return (
      <div
        className="flex min-h-[180px] items-center justify-center rounded-2xl bg-white px-6"
        style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}
        onClick={handleBlankTap}
      >
        {renderEditable("displayName", card.displayName, "text-[15px] text-[#1a1a1a]", "Add your name")}
      </div>
    );
  }

  if (card.displayName.trim() && !card.photo) {
    return (
      <div
        className="flex min-h-[180px] flex-col items-center justify-center gap-3 rounded-2xl bg-white px-6"
        style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}
        onClick={handleBlankTap}
      >
        <input ref={photoRef} type="file" accept="image/*" capture="user" className="hidden" onChange={handlePhoto} />
        {renderEditable("displayName", card.displayName, "text-lg font-semibold text-[#1a1a1a]", "Name")}
        <button type="button" onClick={() => photoRef.current?.click()} className="text-[13px] text-[#666]">
          Add photo
        </button>
      </div>
    );
  }

  if (variant === "preview") {
    return (
      <button
        type="button"
        onClick={onCloseEdit}
        className="flex w-full flex-col rounded-2xl bg-white px-4 py-3 text-left"
        style={{ boxShadow: "0 6px 28px rgba(0,0,0,0.12)" }}
      >
        <div className="flex items-start gap-3">
          <img src={card.photo} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-bold leading-tight text-[#1a1a1a]">{card.displayName}</p>
            {card.title && <p className="text-[11px] text-[#666]">{card.title}</p>}
            {card.subtitle && <p className="text-[10px] text-[#999]">{card.subtitle}</p>}
          </div>
          <NextScanMenu addons={nextScanAddons} onSetAddons={setNextScanAddons} compact />
          <ChevronDown size={16} className="mt-0.5 shrink-0 text-[#bbb]" />
        </div>

        {items.length > 0 && (
          <div className="mt-2.5 space-y-1.5 border-t border-[#f0f0f0] pt-2.5">
            {items.map((item) => (
              <div key={item.id} className="flex items-start gap-2">
                <ContactIcon type={item.type} size={12} className="mt-0.5 shrink-0 text-[#666]" />
                <p className="min-w-0 flex-1 break-words text-[11px] leading-snug text-[#444]">
                  {itemFullLine(item)}
                </p>
              </div>
            ))}
          </div>
        )}

        {card.location && (
          <div className="mt-2 flex items-center gap-1 text-[10px] text-[#aaa]">
            <MapPin size={10} strokeWidth={1.5} />
            {card.location}
          </div>
        )}
      </button>
    );
  }

  return (
    <div
      className="relative flex w-full flex-col rounded-2xl bg-white px-5 py-5"
      style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}
      onClick={handleBlankTap}
    >
      <NextScanMenu addons={nextScanAddons} onSetAddons={setNextScanAddons} />

      <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
      <button
        type="button"
        onClick={() => photoRef.current?.click()}
        className="mx-auto mb-2 block"
      >
        <img
          src={card.photo}
          alt=""
          className="h-[72px] w-[72px] rounded-full object-cover"
          style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
        />
      </button>

      <div className="text-center">
        {renderEditable("displayName", card.displayName, "text-lg font-bold text-[#1a1a1a]", "Name")}
        {renderEditable("title", card.title, "mt-0.5 block text-[12px] text-[#666]", "Title")}
        {renderEditable("subtitle", card.subtitle, "block text-[11px] text-[#888]", "Subtitle")}
        {renderEditable("description", card.description, "block text-[10px] text-[#aaa]", "Tagline")}
      </div>

      {items.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          {gridItems.map((item) => (
            <ContactCell key={item.id} item={item} onOpen={() => openContact(item)} />
          ))}
          {pdfItems.map((item) => (
            <ContactCell key={item.id} item={item} fullWidth onOpen={() => openContact(item)} />
          ))}
        </div>
      )}

      {(card.location || ready) && (
        <div className="mt-3 flex items-center justify-center gap-1 text-[10px] text-[#aaa]">
          <MapPin size={11} strokeWidth={1.5} />
          {renderEditable("location", card.location, "text-[10px] text-[#aaa]", "Add location")}
        </div>
      )}
    </div>
  );
}
