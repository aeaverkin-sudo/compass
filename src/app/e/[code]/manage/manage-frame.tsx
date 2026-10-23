import type { ReactNode } from "react";
import { NetworkBand } from "@/app/network/network-band";
import { ScreenHeader } from "@/shared/components/screen-header";
import { cn } from "@/lib/utils";

export function ManageFrame({
  title,
  fallbackHref,
  onBack,
  centered = false,
  children,
}: {
  title: string;
  fallbackHref: string;
  onBack?: () => void;
  /** Desktop: a 430px column in the middle. Phone width is unchanged. */
  centered?: boolean;
  children: ReactNode;
}) {
  return (
    <main
      className={cn(
        "compass-main relative flex h-dvh w-full flex-col overflow-hidden bg-white text-[var(--ink)]",
        centered && "mx-auto max-w-[430px]",
      )}
    >
      <div className="compass-under-band min-h-0 flex-1 overflow-y-auto px-[var(--gutter)]">
        <ScreenHeader title={title} fallbackHref={fallbackHref} onBack={onBack} />
        {children}
      </div>
      <NetworkBand current="event" />
    </main>
  );
}
