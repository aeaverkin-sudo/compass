"use client";

import { Ellipsis, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { useLongPress } from "@/shared/hooks/use-long-press";
import { openNativePhotoPicker } from "./photo-input-utils";

export const LANDING_PHOTO_SIZE_PX = 149.76;
const LONG_PRESS_MS = 800;

/** Soft corners — same ratio as browse card (13 / 118). */
export function photoRadiusForSize(sizePx: number) {
  return Math.round((13 / 118) * sizePx);
}

export type PhotoLook = "frame" | "shadow";

export function photoSlotLookClass(look?: PhotoLook) {
  return cn(
    look === "frame" && "border border-[#d4d4d4]",
    look === "shadow" && "shadow-[0_2px_8px_rgba(17,17,17,0.16)]",
  );
}

type PhotoSlotPickerProps = {
  photo: string | null;
  onPhotoChange: (photo: string | null, file?: File) => void;
  sizePx?: number;
  borderRadiusPx?: number;
  className?: string;
  surfaceClassName?: string;
  /** When set, the picker does not open and this runs instead. */
  onPickBlocked?: () => void;
  /** Frame or shadow of the slot. Absent is the plain square. */
  photoLook?: PhotoLook;
  /** Long-press then offers FRAME and SHADOW. Omitted on the landing page. */
  onPhotoLook?: (look: PhotoLook | null) => void;
};

export function PhotoSlotPicker({
  photo,
  onPhotoChange,
  sizePx = 118,
  borderRadiusPx = photoRadiusForSize(sizePx),
  className,
  surfaceClassName = "bg-sheet",
  onPickBlocked,
  photoLook,
  onPhotoLook,
}: PhotoSlotPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const pointersDown = useRef(0);
  const [editing, setEditing] = useState(false);
  const [controlsLive, setControlsLive] = useState(false);

  const removeIconSize =
    sizePx >= LANDING_PHOTO_SIZE_PX - 1 ? "size-[18px] text-hairline" : "size-[15px] text-hairline";

  const pickPhoto = () => {
    openNativePhotoPicker(
      (nextPhoto, file) => {
        onPhotoChange(nextPhoto, file);
        setEditing(false);
      },
      () => setEditing(false),
    );
  };

  const longPress = useLongPress(() => {
    if (photo) setEditing(true);
  }, LONG_PRESS_MS);

  useEffect(() => {
    const down = () => {
      pointersDown.current += 1;
    };
    const up = () => {
      pointersDown.current = Math.max(0, pointersDown.current - 1);
    };
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);

  useEffect(() => {
    if (!editing) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-slot='dropdown-menu-content']")) return;
      if (!rootRef.current?.contains(target as Node)) {
        setEditing(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    let cancelArm = false;
    const arm = () => {
      if (cancelArm) return;
      window.setTimeout(() => {
        if (!cancelArm) setControlsLive(true);
      }, 0);
    };
    if (onPhotoLook) {
      if (pointersDown.current === 0) arm();
      else {
        window.addEventListener("pointerup", arm, { once: true });
        window.addEventListener("pointercancel", arm, { once: true });
      }
    }
    return () => {
      cancelArm = true;
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", arm);
      window.removeEventListener("pointercancel", arm);
      setControlsLive(false);
    };
  }, [editing, onPhotoLook]);

  const showPlaceholder = !photo || (editing && !onPhotoLook);

  const slotStyle = {
    width: sizePx,
    height: sizePx,
    borderRadius: borderRadiusPx,
  };

  return (
    <div ref={rootRef} className={cn("relative shrink-0", photoSlotLookClass(photoLook), className)} style={slotStyle}>
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
            onClick={() => {
              if (onPickBlocked) {
                onPickBlocked();
                return;
              }
              pickPhoto();
            }}
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

      {photo && editing && onPhotoLook ? (
        <div
          className={cn("absolute inset-0 z-10", !controlsLive && "pointer-events-none")}
          onClick={(event) => {
            if (event.target !== event.currentTarget) return;
            setEditing(false);
          }}
        >
          <button
            type="button"
            data-card-content
            aria-label="Change photo"
            onClick={(event) => {
              event.stopPropagation();
              if (onPickBlocked) {
                onPickBlocked();
                return;
              }
              pickPhoto();
            }}
            className="absolute top-1/2 left-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center text-[var(--ink)]"
          >
            <Plus className="size-7" strokeWidth={1.5} aria-hidden />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger
              data-card-content
              aria-label="Photo style"
              className={cn(
                "absolute flex items-center justify-center text-[var(--ink)]",
                sizePx >= LANDING_PHOTO_SIZE_PX - 1
                  ? "-top-[3px] -left-[3px] size-9"
                  : "-top-[1.5px] -left-[1.5px] size-[30px]",
              )}
            >
              <Ellipsis className="size-4" strokeWidth={1.5} aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="bottom" className="min-w-0 px-4 py-3">
              <DropdownMenuItem onSelect={() => onPhotoLook(photoLook === "frame" ? null : "frame")}>
                <span className={cn("t-body", photoLook === "frame" ? "text-[var(--ink)]" : "text-[var(--grey)]")}>
                  FRAME
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onPhotoLook(photoLook === "shadow" ? null : "shadow")}>
                <span className={cn("t-body", photoLook === "shadow" ? "text-[var(--ink)]" : "text-[var(--grey)]")}>
                  SHADOW
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            data-card-content
            aria-label="Remove photo"
            onClick={(event) => {
              event.stopPropagation();
              onPhotoChange(null);
              setEditing(false);
            }}
            className={cn(
              "absolute flex items-center justify-center transition-opacity active:opacity-60",
              sizePx >= LANDING_PHOTO_SIZE_PX - 1
                ? "-top-[3px] -right-[3px] size-9"
                : "-top-[1.5px] -right-[1.5px] size-[30px]",
            )}
          >
            <X className={removeIconSize} strokeWidth={1.25} aria-hidden />
          </button>
        </div>
      ) : null}
      {photo && editing && !onPhotoLook ? (
        <button
          type="button"
          data-card-content
          aria-label="Remove photo"
          onClick={(event) => {
            event.stopPropagation();
            onPhotoChange(null);
            setEditing(false);
          }}
          className={cn(
            "absolute z-10 flex items-center justify-center transition-opacity active:opacity-60",
            sizePx >= LANDING_PHOTO_SIZE_PX - 1
              ? "-top-[3px] -right-[3px] size-9"
              : "-top-[1.5px] -right-[1.5px] size-[30px]",
          )}
        >
          <X className={removeIconSize} strokeWidth={1.25} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
