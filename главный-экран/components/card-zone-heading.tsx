import { cn } from "@/lib/utils";

export function CardZoneHeading({
  title,
  className,
  as: Tag = "div",
}: {
  title: string;
  className?: string;
  as?: "div" | "li";
}) {
  return (
    <Tag className={cn("col-span-full flex items-center gap-2", className)}>
      <span className="shrink-0 text-[12px] font-medium leading-none text-label">{title}</span>
      <span className="h-px min-w-3 flex-1 bg-[rgba(20,20,20,0.12)]" aria-hidden />
    </Tag>
  );
}
