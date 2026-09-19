"use client";

type PhotoSource = "selfie" | "gallery" | "file";

const ACTIONS: { id: PhotoSource; emoji: string; label: string }[] = [
  { id: "selfie", emoji: "📷", label: "Selfie" },
  { id: "gallery", emoji: "🖼️", label: "Gallery" },
  { id: "file", emoji: "📁", label: "File" },
];

type PhotoSourceMenuProps = {
  onPick: (source: PhotoSource) => void;
  emojiClassName?: string;
  gapClassName?: string;
};

/** Three source icons laid out inside the photo slot. */
export function PhotoSourceMenu({
  onPick,
  emojiClassName = "text-[22px]",
  gapClassName = "gap-2.5",
}: PhotoSourceMenuProps) {
  return (
    <div
      role="menu"
      aria-label="Photo source"
      className={`flex items-center justify-center ${gapClassName}`}
    >
      {ACTIONS.map(({ id, emoji, label }) => (
        <button
          key={id}
          type="button"
          role="menuitem"
          aria-label={label}
          onClick={() => onPick(id)}
          className={`leading-none transition-transform active:scale-95 ${emojiClassName}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

export type { PhotoSource };
