"use client";

import { useRef, useState } from "react";
import type { Card, ContactItem } from "@/shared/types";
import { getCardItems, isCardReady } from "@/features/portfolio/services/contact-item";
import { ContactIcon } from "./contact-icon";
import { typeLabel } from "@/features/portfolio/services/contact-item";
import { fileToDataUrl } from "@/shared/lib/utils";
import { MapPin, ChevronRight } from "lucide-react";

interface BusinessCardProps {
  card: Card;
  library: ContactItem[];
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onUpdate: (data: Partial<Card>) => void;
  onRemoveItem: (itemId: string) => void;
}

export function BusinessCard({
  card,
  library,
  expanded,
  onExpand,
  onCollapse,
  onUpdate,
  onRemoveItem,
}: BusinessCardProps) {
  const photoRef = useRef<HTMLInputElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);

  const items = getCardItems(card, library);
  const ready = isCardReady(card);

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onUpdate({ photo: await fileToDataUrl(file) });
    e.target.value = "";
  };

  const handleCardTap = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-contact-item]")) return;
    if ((e.target as HTMLElement).closest("[data-editable]")) return;
    if (expanded) onCollapse();
    else if (ready) onExpand();
  };

  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startLongPress = (itemId: string) => {
    if (!expanded) return;
    longPressRef.current = setTimeout(() => setDeleteTarget(itemId), 500);
  };

  const endLongPress = () => {
    if (longPressRef.current) clearTimeout(longPressRef.current);
  };

  const openContact = (item: ContactItem) => {
    if (item.url) window.open(item.url, "_blank", "noopener,noreferrer");
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
          className={`border-b border-[#1a1a1a]/20 bg-transparent text-center outline-none ${className}`}
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
      <div className="flex h-[220px] items-center justify-center px-6">
        {renderEditable(
          "displayName",
          card.displayName,
          "text-[15px] text-[#1a1a1a]",
          "Add your name",
        )}
      </div>
    );
  }

  if (card.displayName.trim() && !card.photo) {
    return (
      <div className="flex h-[220px] flex-col items-center justify-center gap-3 px-6">
        <input ref={photoRef} type="file" accept="image/*" capture="user" className="hidden" onChange={handlePhoto} />
        {renderEditable("displayName", card.displayName, "text-lg font-semibold text-[#1a1a1a]", "Name")}
        <button
          type="button"
          onClick={() => photoRef.current?.click()}
          className="text-[13px] text-[#666] underline-offset-2 hover:underline"
        >
          Add photo
        </button>
      </div>
    );
  }

  const cardInner = (
    <>
      <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          photoRef.current?.click();
        }}
        className="mb-3"
      >
        <img
          src={card.photo}
          alt=""
          className={`rounded-full object-cover ${expanded ? "h-24 w-24" : "h-16 w-16"}`}
          style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
        />
      </button>

      {renderEditable(
        "displayName",
        card.displayName,
        `font-semibold text-[#1a1a1a] ${expanded ? "text-xl" : "text-lg"}`,
        "Name",
      )}

      {renderEditable(
        "title",
        card.title,
        "mt-0.5 text-[13px] text-[#666]",
        "Title",
      )}

      {renderEditable(
        "subtitle",
        card.subtitle,
        "text-[12px] text-[#888]",
        "Subtitle",
      )}

      {renderEditable(
        "description",
        card.description,
        "text-[11px] text-[#aaa]",
        "Tagline",
      )}

      {!expanded && items.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              data-contact-item
              onClick={(e) => {
                e.stopPropagation();
                openContact(item);
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f0f0f0] text-[#444]"
            >
              <ContactIcon type={item.type} size={16} />
            </button>
          ))}
        </div>
      )}

      {expanded && items.length > 0 && (
        <div className="mt-5 grid w-full grid-cols-2 gap-2 px-1">
          {items.map((item) => (
            <div key={item.id} className="relative">
              <button
                type="button"
                data-contact-item
                onClick={() => openContact(item)}
                onPointerDown={() => startLongPress(item.id)}
                onPointerUp={endLongPress}
                onPointerLeave={endLongPress}
                className="flex w-full items-start gap-2 rounded-xl bg-[#f7f7f7] p-3 text-left"
              >
                <ContactIcon type={item.type} size={18} className="mt-0.5 text-[#555]" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-[#888]">{typeLabel(item.type)}</p>
                  <p className="truncate text-[13px] font-medium text-[#1a1a1a]">
                    {item.label || item.value.replace(/^https?:\/\//, "")}
                  </p>
                </div>
                <ChevronRight size={14} className="mt-1 shrink-0 text-[#ccc]" />
              </button>
              {deleteTarget === item.id && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveItem(item.id);
                    setDeleteTarget(null);
                  }}
                  className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-[#1a1a1a] text-[12px] text-white"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {(card.location || expanded) && (
        <div className="mt-4 flex items-center justify-center gap-1 text-[11px] text-[#aaa]">
          <MapPin size={12} strokeWidth={1.5} />
          {renderEditable("location", card.location, "text-[11px] text-[#aaa]", "Add location")}
        </div>
      )}
    </>
  );

  if (expanded) {
    return (
      <div
        className="fixed inset-x-0 z-40 mx-auto max-w-lg px-4"
        style={{ top: "18%", bottom: "28%" }}
        onClick={handleCardTap}
      >
        <div
          className="flex h-full flex-col items-center overflow-y-auto rounded-2xl bg-white px-5 py-6"
          style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }}
        >
          {cardInner}
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleCardTap}
      className="flex w-[280px] flex-col items-center rounded-2xl bg-white px-5 py-5 text-center"
      style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }}
    >
      {cardInner}
    </button>
  );
}
