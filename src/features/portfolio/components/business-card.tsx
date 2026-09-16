"use client";

import { useRef, useState } from "react";
import type { Card, ContactItem, NextScanAddon } from "@/shared/types";
import {
  getCardItems,
  isCardReady,
  itemDisplayValue,
  itemCompactLabel,
  typeLabel,
} from "@/features/portfolio/services/contact-item";
import { ContactIcon } from "./contact-icon";
import { NextScanMenu, NextScanAddonIcon } from "./next-scan-menu";
import { fileToDataUrl } from "@/shared/lib/utils";
import { MapPin, ChevronRight, ChevronDown } from "lucide-react";

interface BusinessCardProps {
  card: Card;
  library: ContactItem[];
  variant: "full" | "compact";
  onUpdate: (data: Partial<Card>) => void;
  onCloseEdit?: () => void;
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
      className={`flex items-start gap-2 rounded-xl border border-[#efefef] bg-white p-3 text-left ${
        fullWidth ? "col-span-2" : ""
      }`}
    >
      <ContactIcon type={item.type} size={18} className="mt-0.5 shrink-0 text-[#444]" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-[#999]">{typeLabel(item.type)}</p>
        <p className="truncate text-[13px] font-semibold text-[#1a1a1a]">
          {itemDisplayValue(item)}
        </p>
      </div>
      <ChevronRight size={14} className="mt-1 shrink-0 text-[#ccc]" />
    </button>
  );
}

export function BusinessCard({
  card,
  library,
  variant,
  onUpdate,
  onCloseEdit,
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

  const setNextScanAddon = (addon: NextScanAddon | null) => {
    onUpdate({ nextScanAddon: addon });
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
      <div className="flex min-h-[200px] items-center justify-center px-6">
        {renderEditable("displayName", card.displayName, "text-[15px] text-[#1a1a1a]", "Add your name")}
      </div>
    );
  }

  if (card.displayName.trim() && !card.photo) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 px-6">
        <input ref={photoRef} type="file" accept="image/*" capture="user" className="hidden" onChange={handlePhoto} />
        {renderEditable("displayName", card.displayName, "text-lg font-semibold text-[#1a1a1a]", "Name")}
        <button type="button" onClick={() => photoRef.current?.click()} className="text-[13px] text-[#666]">
          Add photo
        </button>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <button
        type="button"
        onClick={onCloseEdit}
        className="mx-4 flex w-[calc(100%-2rem)] max-w-lg flex-col rounded-2xl bg-white px-4 py-3 text-left transition-all duration-300"
        style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}
      >
        <div className="flex items-center gap-3">
          <img src={card.photo} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-[#1a1a1a]">{card.displayName}</p>
            {card.title && <p className="truncate text-[12px] text-[#888]">{card.title}</p>}
          </div>
          <NextScanMenu addon={card.nextScanAddon} onSetAddon={setNextScanAddon} compact />
          <ChevronDown size={18} className="shrink-0 text-[#bbb]" />
        </div>

        {items.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-[#f0f0f0] pt-2">
            {items.map((item) => (
              <span key={item.id} className="flex items-center gap-1 text-[11px] text-[#666]">
                <ContactIcon type={item.type} size={12} />
                {itemCompactLabel(item)}
              </span>
            ))}
          </div>
        )}
      </button>
    );
  }

  return (
    <div
      className="relative mx-auto flex w-[min(340px,calc(100%-2rem))] max-h-[min(52vh,520px)] flex-col overflow-y-auto rounded-2xl bg-white px-5 py-5"
      style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}
    >
      <NextScanMenu addon={card.nextScanAddon} onSetAddon={setNextScanAddon} />

      <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
      <button
        type="button"
        onClick={() => photoRef.current?.click()}
        className="mx-auto mb-3 block"
      >
        <img
          src={card.photo}
          alt=""
          className="h-20 w-20 rounded-full object-cover"
          style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
        />
      </button>

      <div className="text-center">
        {renderEditable("displayName", card.displayName, "text-xl font-bold text-[#1a1a1a]", "Name")}
        {renderEditable("title", card.title, "mt-1 block text-[13px] text-[#666]", "Title")}
        {renderEditable("subtitle", card.subtitle, "block text-[12px] text-[#888]", "Subtitle")}
        {renderEditable("description", card.description, "block text-[11px] text-[#aaa]", "Tagline")}
      </div>

      {items.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {gridItems.map((item) => (
            <ContactCell key={item.id} item={item} onOpen={() => openContact(item)} />
          ))}
          {pdfItems.map((item) => (
            <ContactCell key={item.id} item={item} fullWidth onOpen={() => openContact(item)} />
          ))}
        </div>
      )}

      {(card.location || ready) && (
        <div className="mt-4 flex items-center justify-center gap-1 text-[11px] text-[#aaa]">
          <MapPin size={12} strokeWidth={1.5} />
          {renderEditable("location", card.location, "text-[11px] text-[#aaa]", "Add location")}
        </div>
      )}
    </div>
  );
}
