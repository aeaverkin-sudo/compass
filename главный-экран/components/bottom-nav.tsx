"use client";

type BottomNavProps = {
  /** Distance from each screen edge to the card, so the labels sit on the card's column. */
  insetPx: number;
  onEdit: () => void;
};

/** Sits on the middle line of the sky plate it is placed in. */
export function BottomNav({ insetPx, onEdit }: BottomNavProps) {
  return (
    <nav
      className="pointer-events-auto absolute top-1/2 grid -translate-y-1/2 grid-cols-3 items-center px-[calc(clamp(24px,6.1vw,28px)-3mm)] text-[17px] leading-none font-light tracking-[-0.01em] text-[#111] select-none [-webkit-touch-callout:none]"
      style={{
        left: insetPx,
        right: insetPx,
        fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
    >
      <span aria-current="page" className="justify-self-start py-2">
        Profile
      </span>
      <button
        type="button"
        className="justify-self-center px-2 py-2"
        onPointerDown={(event) => {
          event.preventDefault();
          window.getSelection()?.removeAllRanges();
        }}
        onPointerUp={(event) => {
          if (event.pointerType === "mouse" && event.button !== 0) return;
          onEdit();
        }}
        onContextMenu={(event) => event.preventDefault()}
      >
        Edit
      </button>
      <span className="justify-self-end py-2">Network</span>
    </nav>
  );
}
