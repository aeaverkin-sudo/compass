"use client";

import { useRef, useState } from "react";
import type { ContentSlot } from "@/shared/types";
import { detectContentType, deriveLabel } from "@/features/portfolio/services/content-detector";
import { fileToDataUrl } from "@/shared/lib/utils";

interface FieldEditPanelProps {
  slot: ContentSlot;
  onSave: (data: Partial<ContentSlot>) => void;
  onClose: () => void;
}

export function FieldEditPanel({ slot, onSave, onClose }: FieldEditPanelProps) {
  const [label, setLabel] = useState(slot.label);
  const [value, setValue] = useState(
    slot.type === "empty" ? "" : slot.value,
  );
  const fileRef = useRef<HTMLInputElement>(null);

  const applyValue = (newValue: string, mimeType?: string) => {
    const type = detectContentType(newValue, mimeType);
    const newLabel = deriveLabel(newValue, type, label);
    onSave({ value: newValue, type, label: newLabel });
    onClose();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    applyValue(dataUrl, file.type);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/20">
      <div
        className="w-full max-w-lg bg-[#faf9f7] p-6"
        style={{ boxShadow: "0 -2px 12px rgba(0,0,0,0.08)" }}
      >
        <p className="mb-4 text-[13px] tracking-wide text-[#888] uppercase">Edit</p>

        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label"
          className="mb-3 w-full border-b border-[#ccc] bg-transparent py-2 text-[14px] outline-none"
        />

        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Paste link, type text, or upload below"
          rows={3}
          className="mb-4 w-full border-b border-[#ccc] bg-transparent py-2 text-[14px] outline-none"
        />

        <div className="mb-4 flex gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="text-[13px] text-[#1a1a1a] underline"
          >
            Upload file / photo
          </button>
          <input ref={fileRef} type="file" className="hidden" onChange={handleFile} />
        </div>

        <div className="flex gap-6">
          <button
            type="button"
            onClick={() => {
              const type = detectContentType(value);
              onSave({
                value,
                type,
                label: label || deriveLabel(value, type),
              });
              onClose();
            }}
            className="text-[14px] text-[#1a1a1a]"
          >
            Save
          </button>
          <button type="button" onClick={onClose} className="text-[14px] text-[#888]">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
