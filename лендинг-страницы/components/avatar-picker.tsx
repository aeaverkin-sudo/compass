"use client";

import { FileText, ImageIcon, Plus, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type PickerAction = "gallery" | "file";

type AvatarPickerProps = {
  photo: string | null;
  onPhotoChange: (photo: string | null) => void;
};

const EXTRA_ACTIONS: { id: PickerAction; Icon: LucideIcon; label: string }[] = [
  { id: "gallery", Icon: ImageIcon, label: "Галерея" },
  { id: "file", Icon: FileText, label: "Файл" },
];

const PICKER_ICON = "size-[20.4px] text-hairline";
const LONG_PRESS_MS = 700;

/** iOS Safari ignores file inputs with display:none — keep them visually hidden but present. */
const HIDDEN_INPUT =
  "pointer-events-none fixed left-0 top-0 h-px w-px overflow-hidden opacity-0";

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function AvatarPicker({ photo, onPhotoChange }: AvatarPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const selfieRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPress = useRef(false);
  const [open, setOpen] = useState(false);

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

  const clearPressTimer = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const openSelfie = () => {
    selfieRef.current?.click();
  };

  const openPicker = (action: PickerAction) => {
    if (action === "gallery") galleryRef.current?.click();
    if (action === "file") fileRef.current?.click();
    setOpen(false);
  };

  const onFile = async (file: File | undefined, input?: HTMLInputElement | null) => {
    if (!file) return;
    onPhotoChange(await fileToDataUrl(file));
    if (input) input.value = "";
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-label="Сделать селфи. Удерживайте для галереи и файла."
        aria-expanded={open}
        onPointerDown={() => {
          longPress.current = false;
          clearPressTimer();
          pressTimer.current = setTimeout(() => {
            longPress.current = true;
            setOpen(true);
          }, LONG_PRESS_MS);
        }}
        onPointerUp={clearPressTimer}
        onPointerLeave={clearPressTimer}
        onPointerCancel={clearPressTimer}
        onClick={() => {
          if (longPress.current) {
            longPress.current = false;
            return;
          }
          openSelfie();
        }}
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
          aria-label="Галерея и файл"
          className="absolute top-[calc(100%+14px)] left-1/2 z-10 flex -translate-x-1/2 items-center gap-5"
        >
          {EXTRA_ACTIONS.map(({ id, Icon, label }) => (
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
        className={HIDDEN_INPUT}
        tabIndex={-1}
        aria-hidden
        onChange={(event) => onFile(event.target.files?.[0], event.target)}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className={HIDDEN_INPUT}
        tabIndex={-1}
        aria-hidden
        onChange={(event) => onFile(event.target.files?.[0], event.target)}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        className={HIDDEN_INPUT}
        tabIndex={-1}
        aria-hidden
        onChange={(event) => onFile(event.target.files?.[0], event.target)}
      />
    </div>
  );
}
