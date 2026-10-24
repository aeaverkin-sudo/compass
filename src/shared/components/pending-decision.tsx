import { cn } from "@/lib/utils";

const YES =
  "press border-0 bg-sky px-3 py-2 t-band leading-[1.45] text-[var(--ink)] [-webkit-tap-highlight-color:transparent]";
const NO =
  "press border border-[var(--rule)] bg-white px-3 py-2 t-caps text-[var(--grey)] [-webkit-tap-highlight-color:transparent]";

export function YesButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={cn(YES, className)}>
      Yes
    </button>
  );
}

export function NoButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={cn(NO, className)}>
      No
    </button>
  );
}

export function UndoRow({ onUndo }: { onUndo: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="m-0 t-meta text-[var(--grey)]">Removing…</p>
      <button
        type="button"
        onClick={onUndo}
        className="press border-0 bg-transparent px-3 py-2 t-caps text-[var(--ink)] [-webkit-tap-highlight-color:transparent]"
      >
        Undo (3s)
      </button>
    </div>
  );
}
