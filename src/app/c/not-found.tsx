import { ScreenHeader } from "@/shared/components/screen-header";
import { VALUE_AXIS_PX } from "@/shared/layout/axes";

export default function CardNotFound() {
  return (
    <main className="compass-main flex h-dvh flex-col overflow-y-auto bg-white px-[var(--gutter)] pb-12 text-[#111]">
      <ScreenHeader title="Not found" fallbackHref="/" />
      <p className="pt-[18px] t-body" style={{ marginLeft: VALUE_AXIS_PX }}>
        This portfolio was deleted or renamed.
      </p>
    </main>
  );
}
