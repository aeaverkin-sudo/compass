"use client";

import { Camera, FileText, ImageIcon, type LucideIcon } from "lucide-react";

type PhotoSource = "selfie" | "gallery" | "file";

const ACTIONS: { id: PhotoSource; Icon: LucideIcon; label: string }[] = [
  { id: "selfie", Icon: Camera, label: "Selfie" },
  { id: "gallery", Icon: ImageIcon, label: "Gallery" },
  { id: "file", Icon: FileText, label: "File" },
];

type PhotoSourceMenuProps = {
  onPick: (source: PhotoSource) => void;
  iconClassName?: string;
  gapClassName?: string;
};

/** Three source icons laid out inside the photo slot. */
export function PhotoSourceMenu({
  onPick,
  iconClassName = "size-[20.4px] text-hairline",
  gapClassName = "gap-3",
}: PhotoSourceMenuProps) {
  return (
    <div
      role="menu"
      aria-label="Photo source"
      className={`flex items-center justify-center ${gapClassName}`}
    >
      {ACTIONS.map(({ id, Icon, label }) => (
        <button
          key={id}
          type="button"
          role="menuitem"
          aria-label={label}
          onClick={() => onPick(id)}
          className="flex items-center justify-center transition-opacity active:opacity-60"
        >
          <Icon className={iconClassName} strokeWidth={1.25} aria-hidden />
        </button>
      ))}
    </div>
  );
}

export type { PhotoSource };
