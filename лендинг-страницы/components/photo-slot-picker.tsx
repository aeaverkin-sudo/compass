"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useLongPress } from "@/shared/hooks/use-long-press";
import { PhotoSourceMenu, type PhotoSource } from "./photo-source-menu";
import { HIDDEN_INPUT, openSelfiePicker, preparePhotoForStorage } from "./photo-input-utils";

export const LANDING_PHOTO_SIZE_PX = 149.76;
const LONG_PRESS_MS = 800;

/** Soft corners — same ratio as browse card (13 / 118). */
export function photoRadiusForSize(sizePx: number) {
  return Math.round((13 / 118) * sizePx);
}

type PhotoSlotPickerProps = {
  photo: string | null;
  onPhotoChange: (photo: string | null) => void;
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
  const removeIconSize =
    sizePx >= LANDING_PHOTO_SIZE_PX - 1 ? "size-[18px] text-hairline" : "size-[15px] text-hairline";

  const longPress = useLongPress(() => {
    if (photo) setOpen(true);
  }, LONG_PRESS_MS);

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
    onPhotoChange(await preparePhotoForStorage(file));
    input.value = "";
  };

  const openPicker = (action: PhotoSource) => {
    setOpen(false);
    if (action === "selfie") {
      openSelfiePicker((nextPhoto) => onPhotoChange(nextPhoto));
      return;
    }
    if (action === "gallery") galleryRef.current?.click();
    if (action === "file") fileRef.current?.click();
  };

  const removePhoto = () => {
    onPhotoChange(null);
    setOpen(false);
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
          <div
            data-card-content
            aria-label="Hold to change photo"
            className="compass-press relative size-full select-none"
            {...longPress}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt="" className="size-full object-cover" draggable={false} />
          </div>
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

      {open && photo ? (
        <button
          type="button"
          data-card-content
          aria-label="Remove photo"
          onClick={(event) => {
            event.stopPropagation();
            removePhoto();
          }}
          className="absolute top-1.5 right-1.5 z-10 flex items-center justify-center transition-opacity active:opacity-60"
        >
          <X className={removeIconSize} strokeWidth={1.25} aria-hidden />
        </button>
      ) : null}

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
