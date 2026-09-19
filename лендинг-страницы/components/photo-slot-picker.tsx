"use client";

import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { PhotoSourceMenu, type PhotoSource } from "./photo-source-menu";
import { fileToDataUrl, HIDDEN_INPUT, openSelfiePicker } from "./photo-input-utils";

export const LANDING_PHOTO_SIZE_PX = 149.76;

/** Soft corners — same ratio as browse card (13 / 118). */
export function photoRadiusForSize(sizePx: number) {
  return Math.round((13 / 118) * sizePx);
}

type PhotoSlotPickerProps = {
  photo: string | null;
  onPhotoChange: (photo: string) => void;
  sizePx?: number;
  borderRadiusPx?: number;
  className?: string;
  surfaceClassName?: string;
};

export function PhotoSlotPicker({
  photo,
  onPhotoChange,
  sizePx = 118,
  borderRadiusPx = photoRadiusForSize(sizePx),
  className,
  surfaceClassName = "bg-background-ready",
}: PhotoSlotPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);

  const iconSize =
    sizePx >= LANDING_PHOTO_SIZE_PX - 1 ? "size-6 text-hairline" : "size-[20.4px] text-hairline";
  const iconGap = sizePx >= LANDING_PHOTO_SIZE_PX - 1 ? "gap-4" : "gap-3";

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

  const onFile = async (file: File | undefined, input: HTMLInputElement) => {
    if (!file) return;
    onPhotoChange(await fileToDataUrl(file));
    input.value = "";
  };

  const openPicker = (action: PhotoSource) => {
    setOpen(false);
    if (action === "selfie") {
      openSelfiePicker(onPhotoChange);
      return;
    }
    if (action === "gallery") galleryRef.current?.click();
    if (action === "file") fileRef.current?.click();
  };

  const slotStyle = {
    width: sizePx,
    height: sizePx,
    borderRadius: borderRadiusPx,
  };

  return (
    <div ref={rootRef} className={cn("relative shrink-0", className)} style={slotStyle}>
      <div
        className={cn(
          "flex size-full items-center justify-center overflow-hidden border border-hairline",
          surfaceClassName,
        )}
        style={{ borderRadius: borderRadiusPx }}
      >
        {open ? (
          <PhotoSourceMenu onPick={openPicker} iconClassName={iconSize} gapClassName={iconGap} />
        ) : photo ? (
          <button
            type="button"
            data-card-content
            aria-label="Change photo"
            onClick={() => setOpen(true)}
            className="size-full transition-opacity active:opacity-80"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt="" className="size-full object-cover" />
          </button>
        ) : (
          <button
            type="button"
            data-card-content
            aria-label="Add photo"
            aria-expanded={open}
            onClick={() => setOpen(true)}
            className="flex size-full items-center justify-center transition-opacity active:opacity-80"
          >
            <Plus className="size-7 text-hint" strokeWidth={1.5} aria-hidden />
          </button>
        )}
      </div>

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
