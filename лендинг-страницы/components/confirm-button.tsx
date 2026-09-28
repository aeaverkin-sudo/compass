import { cn } from "@/lib/utils";

type ConfirmButtonProps = {
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
};

export function ConfirmButton({ onClick, className, disabled }: ConfirmButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "min-w-[160px] border border-hairline bg-transparent px-10 py-3",
        "text-[13px] font-normal tracking-[0.18em] text-foreground uppercase",
        "transition-opacity active:opacity-60",
        "disabled:opacity-40",
        className,
      )}
    >
      CONFIRM
    </button>
  );
}
