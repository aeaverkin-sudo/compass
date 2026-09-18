import { cn } from "@/lib/utils";

type ConfirmButtonProps = {
  onClick?: () => void;
  className?: string;
};

export function ConfirmButton({ onClick, className }: ConfirmButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-w-[160px] border border-hairline bg-transparent px-10 py-3",
        "text-[13px] font-normal tracking-[0.18em] text-foreground uppercase",
        "transition-opacity active:opacity-60",
        className,
      )}
    >
      CONFIRM
    </button>
  );
}
