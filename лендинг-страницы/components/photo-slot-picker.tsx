"use client";

import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLongPress } from "@/shared/hooks/use-long-press";
import { openNativePhotoPicker } from "./photo-input-utils";

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
  const removeIconSize =
    sizePx >= LANDING_PHOTO_SIZE_PX - 1 ? "size-[18px] text-hairline" : "size-[15px] text-hairline";

  const pickPhoto = () => {
    openNativePhotoPicker(
      (nextPhoto) => onPhotoChange(nextPhoto),
      undefined,
    );
  };

  const longPress = useLongPress(() => {
    if (photo) pickPhoto();
  }, LONG_PRESS_MS);

  const slotStyle = {
    width: sizePx,
    height: sizePx,
    borderRadius: borderRadiusPx,
  };

  return (
    <div className={cn("relative shrink-0", className)} style={slotStyle}>
      <div
        className={cn(
          "flex size-full items-center justify-center overflow-hidden border border-hairline",
          surfaceClassName,
        )}
        style={{ borderRadius: borderRadiusPx }}
      >
        {photo ? (
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
            onClick={pickPhoto}
            className="flex size-full items-center justify-center transition-opacity active:opacity-80"
          >
            <Plus className="size-7 text-hint" strokeWidth={1.5} aria-hidden />
          </button>
        )}
      </div>

      {photo ? (
        <button
          type="button"
          data-card-content
          aria-label="Remove photo"
          onClick={(event) => {
            event.stopPropagation();
            onPhotoChange(null);
          }}
          className="absolute top-1.5 right-1.5 z-10 flex items-center justify-center transition-opacity active:opacity-60"
        >
          <X className={removeIconSize} strokeWidth={1.25} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
