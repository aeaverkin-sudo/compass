import { ScreenHeader } from "@/shared/components/screen-header";
import { VALUE_AXIS_PX } from "@/shared/layout/axes";

export default function NotFound() {
  return (
    <main className="compass-main flex h-dvh flex-col overflow-y-auto bg-white px-[var(--gutter)] pb-12 text-[#111]">
      <ScreenHeader title="Not found" fallbackHref="/" />
      <p className="t-body" style={{ marginLeft: VALUE_AXIS_PX }}>
        This page doesn&apos;t exist.
      </p>
    </main>
  );
}
