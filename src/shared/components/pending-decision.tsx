import { cn } from "@/lib/utils";

const YES =
  "press border-0 bg-sky px-3 py-2 t-band leading-[1.45] text-[var(--ink)] [-webkit-tap-highlight-color:transparent]";
const NO =
  "press border border-[var(--rule)] bg-white px-3 py-2 t-caps text-[var(--grey)] [-webkit-tap-highlight-color:transparent]";

export function YesButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={cn(YES, className)}>
      Confirm
    </button>
  );
}

export function NoButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={cn(NO, className)}>
      Skip
    </button>
  );
}

export function UndoRow({ onUndo }: { onUndo: () => void }) {
  return (
    <div className="flex justify-end">
      <button
        type="button"
        onClick={onUndo}
        className="press border-0 bg-transparent px-3 py-2 t-caps text-[var(--ink)] [-webkit-tap-highlight-color:transparent]"
      >
        Undo
      </button>
    </div>
  );
}
