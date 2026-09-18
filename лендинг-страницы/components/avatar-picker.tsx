"use client";

import { Camera, FileText, ImageIcon, Plus, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type PickerAction = "selfie" | "gallery" | "file";

const ACTIONS: { id: PickerAction; Icon: LucideIcon; label: string }[] = [
  { id: "file", Icon: FileText, label: "Файл" },
  { id: "selfie", Icon: Camera, label: "Селфи" },
  { id: "gallery", Icon: ImageIcon, label: "Галерея" },
];

const PICKER_ICON = "size-[17px] text-hairline";

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function AvatarPicker() {
  const rootRef = useRef<HTMLDivElement>(null);
  const selfieRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const openPicker = (action: PickerAction) => {
    setOpen(false);
    if (action === "selfie") selfieRef.current?.click();
    if (action === "gallery") galleryRef.current?.click();
    if (action === "file") fileRef.current?.click();
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setPhoto(await fileToDataUrl(file));
  };

  return (
    <div ref={rootRef} className="relative shrink-0 -translate-y-[2cm]">
      <button
        type="button"
        aria-label="Добавить фото"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex size-[149.76px] items-center justify-center overflow-hidden rounded-full border border-hairline bg-background",
          "transition-opacity active:opacity-80",
        )}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="size-full object-cover" />
        ) : (
          <Plus className="size-7 text-hint" strokeWidth={1.5} aria-hidden />
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Выбор фото"
          className="absolute top-[calc(100%+14px)] left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-4"
        >
          {ACTIONS.map(({ id, Icon, label }) => (
            <button
              key={id}
              type="button"
              role="menuitem"
              aria-label={label}
              onClick={() => openPicker(id)}
              className="flex items-center justify-center transition-opacity active:opacity-60"
            >
              <Icon className={PICKER_ICON} strokeWidth={1.25} aria-hidden />
            </button>
          ))}
        </div>
      )}

      <input
        ref={selfieRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={(event) => onFile(event.target.files?.[0])}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => onFile(event.target.files?.[0])}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(event) => onFile(event.target.files?.[0])}
      />
    </div>
  );
}
