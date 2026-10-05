import type { ReactNode } from "react";
import { NetworkBand } from "@/app/network/network-band";
import { ScreenHeader } from "@/shared/components/screen-header";

export function ManageFrame({
  title,
  fallbackHref,
  onBack,
  children,
}: {
  title: string;
  fallbackHref: string;
  onBack?: () => void;
  children: ReactNode;
}) {
  return (
    <main className="compass-main flex h-dvh flex-col overflow-hidden bg-white text-[var(--ink)]">
      <div className="min-h-0 flex-1 overflow-y-auto px-[var(--gutter)] pb-8">
        <ScreenHeader title={title} fallbackHref={fallbackHref} onBack={onBack} />
        {children}
      </div>
      <NetworkBand current="event" />
    </main>
  );
}
