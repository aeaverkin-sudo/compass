"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  surfaceClassName = "bg-sheet",
}: PhotoSlotPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);

  const removeIconSize =
    sizePx >= LANDING_PHOTO_SIZE_PX - 1 ? "size-[18px] text-hairline" : "size-[15px] text-hairline";

  const pickPhoto = () => {
    openNativePhotoPicker(
      (nextPhoto) => {
        onPhotoChange(nextPhoto);
        setEditing(false);
      },
      () => setEditing(false),
    );
  };

  const longPress = useLongPress(() => {
    if (photo) setEditing(true);
  }, LONG_PRESS_MS);

  useEffect(() => {
    if (!editing) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setEditing(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [editing]);

  const showPlaceholder = !photo || editing;

  const slotStyle = {
    width: sizePx,
    height: sizePx,
    borderRadius: borderRadiusPx,
  };

  return (
    <div ref={rootRef} className={cn("relative shrink-0", className)} style={slotStyle}>
      <div
        className={cn(
          "flex size-full items-center justify-center overflow-hidden",
          surfaceClassName,
        )}
        style={{ borderRadius: borderRadiusPx }}
      >
        {showPlaceholder ? (
          <button
            type="button"
            data-card-content
            aria-label={photo ? "Change photo" : "Add photo"}
            onClick={pickPhoto}
            className="flex size-full items-center justify-center transition-opacity active:opacity-80"
          >
            <Plus className="size-7 text-hint" strokeWidth={1.5} aria-hidden />
          </button>
        ) : (
          <div
            data-card-content
            aria-label="Hold to change photo"
            className="compass-press relative size-full touch-none select-none"
            {...longPress}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt="" className="size-full object-cover" draggable={false} />
          </div>
        )}
      </div>

      {photo && editing ? (
        <button
          type="button"
          data-card-content
          aria-label="Remove photo"
          onClick={(event) => {
            event.stopPropagation();
            onPhotoChange(null);
            setEditing(false);
          }}
          className="absolute top-1.5 right-1.5 z-10 flex items-center justify-center transition-opacity active:opacity-60"
        >
          <X className={removeIconSize} strokeWidth={1.25} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
