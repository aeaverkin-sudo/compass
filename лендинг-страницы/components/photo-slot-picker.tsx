"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useLongPress } from "@/shared/hooks/use-long-press";
import { PhotoSourceMenu, type PhotoSource } from "./photo-source-menu";
import {
  openCardFilePicker,
  openCardGalleryPicker,
  openSelfiePicker,
} from "./photo-input-utils";

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
  const [open, setOpen] = useState(false);

  const iconSize =
    sizePx >= LANDING_PHOTO_SIZE_PX - 1 ? "size-6 text-hairline" : "size-[20.4px] text-hairline";
  const iconGap = sizePx >= LANDING_PHOTO_SIZE_PX - 1 ? "gap-4" : "gap-3";
  const removeIconSize =
    sizePx >= LANDING_PHOTO_SIZE_PX - 1 ? "size-[18px] text-hairline" : "size-[15px] text-hairline";

  const closeMenu = () => setOpen(false);

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

  const openPicker = (action: PhotoSource) => {
    const onPick = (nextPhoto: string) => {
      onPhotoChange(nextPhoto);
      closeMenu();
    };
    const onDismiss = () => closeMenu();

    if (action === "selfie") {
      openSelfiePicker(onPick, onDismiss);
    } else if (action === "gallery") {
      openCardGalleryPicker(onPick, onDismiss);
    } else {
      openCardFilePicker(onPick, onDismiss);
    }

    // Close after input.click() — closing before breaks iOS user activation.
    closeMenu();
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
            className="compass-press relative size-full touch-none select-none"
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
    </div>
  );
}
