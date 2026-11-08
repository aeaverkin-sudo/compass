"use client";

import { useEffect } from "react";
import { ScreenHeader } from "@/shared/components/screen-header";
import { VALUE_AXIS_PX } from "@/shared/layout/axes";

export default function Error({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="compass-main flex h-dvh flex-col overflow-y-auto bg-white px-[var(--gutter)] pb-12 text-[#111]">
      <ScreenHeader title="Error" fallbackHref="/" />
      <p className="t-body" style={{ marginLeft: VALUE_AXIS_PX }}>
        Something went wrong.
      </p>
    </main>
  );
}
