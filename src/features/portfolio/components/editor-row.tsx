"use client";

import { useRef, useState } from "react";
import type { ContactItem } from "@/shared/types";
import { buildContactItem, typeLabel } from "@/features/portfolio/services/contact-item";
import { fileToDataUrl } from "@/shared/lib/utils";

interface EditorRowProps {
  item: ContactItem;
  isActive: boolean;
  isEmpty: boolean;
  onUpdate: (data: Partial<ContactItem>) => void;
  onToggleActive: () => void;
}

export function EditorRow({
  item,
  isActive,
  isEmpty,
  onUpdate,
  onToggleActive,
}: EditorRowProps) {
  const [editing, setEditing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const applyValue = async (raw: string, mime?: string) => {
    const value = raw.trim();
    if (!value) return;
    const built = buildContactItem(value, mime);
    onUpdate({
      value: built.value,
      type: built.type,
      url: built.url,
      label: item.label || built.label,
    });
    setEditing(false);
  };

  const displayType = typeLabel(item.type);
  const displayValue = item.value || item.label;

  return (
    <div className="flex h-11 shrink-0 items-center gap-3 border-b border-[#f5f5f5] py-1">
      <input ref={fileRef} type="file" accept="*/*" className="hidden" onChange={async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        await applyValue(await fileToDataUrl(file), file.type);
        e.target.value = "";
      }} />

      {editing ? (
        <input
          autoFocus
          type="text"
          defaultValue={isEmpty ? "" : displayValue}
          placeholder="Paste link, email, phone…"
          className="min-w-0 flex-1 border-b border-[#1a1a1a]/20 bg-transparent py-1 text-[14px] outline-none"
          onChange={(e) => {
            const v = e.target.value;
            if (v.trim()) {
              const built = buildContactItem(v);
              onUpdate({ value: v, type: built.type, url: built.url, label: item.label || built.label });
            }
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (text) applyValue(text);
          }}
          onBlur={() => setEditing(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex min-w-0 flex-1 items-baseline gap-3 text-left"
        >
          <span
            className={`w-[72px] shrink-0 truncate text-[13px] ${
              isActive && !isEmpty ? "font-medium text-[#1a1a1a]" : "text-[#888]"
            }`}
          >
            {isEmpty ? "New" : displayType}
          </span>
          <span
            className={`min-w-0 flex-1 truncate text-[14px] ${
              isActive && !isEmpty ? "font-semibold text-[#1a1a1a]" : "text-[#999]"
            } ${isEmpty ? "text-[#bbb]" : ""}`}
          >
            {isEmpty ? "Add anything" : displayValue.replace(/^https?:\/\//, "")}
          </span>
        </button>
      )}

      {!isEmpty && !editing && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleActive();
          }}
          className="shrink-0 px-1 text-[18px] font-light leading-none text-[#1a1a1a]"
        >
          {isActive ? "−" : "+"}
        </button>
      )}
    </div>
  );
}
