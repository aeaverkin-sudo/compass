"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { NameOrTitleField } from "@/shared/components/name-or-title-field";
import { useAppStore } from "@/shared/store/app-store";
import { CARD_HEADER_NAME_SIZE_PX, CARD_PHOTO_RADIUS_PX, CARD_PHOTO_SIZE_PX } from "@main/layout";
import { ConfirmButton } from "./confirm-button";
import { PhotoSlotPicker } from "./photo-slot-picker";

function isFilled(value: string) {
  return value.trim().length > 0;
}

export function LandingPage() {
  const router = useRouter();
  const [photo, setPhoto] = useState<string | null>(null);
  const [name, setName] = useState("");

  const completeOnboarding = useAppStore((state) => state.completeOnboarding);

  const ready = useMemo(() => Boolean(photo) && isFilled(name), [photo, name]);

  useEffect(() => {
    document.documentElement.classList.toggle("compass-ready", ready);

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute(
        "content",
        getComputedStyle(document.documentElement).getPropertyValue("--theme-color").trim(),
      );
    }
  }, [ready]);

  const handleConfirm = () => {
    if (!photo || !isFilled(name)) return;
    completeOnboarding({
      photo,
      displayName: name.trim(),
    });
    router.push("/main");
  };

  return (
    <main className="compass-main flex h-lvh flex-col overflow-hidden bg-transparent">
      <div className="flex flex-1 flex-col items-center justify-center px-8 pb-[14vh]">
        <PhotoSlotPicker
          photo={photo}
          onPhotoChange={setPhoto}
          sizePx={CARD_PHOTO_SIZE_PX}
          borderRadiusPx={CARD_PHOTO_RADIUS_PX}
          surfaceClassName="bg-background"
        />
        <label
          className="mt-[2.3em] w-full max-w-xs text-center"
          style={{ fontSize: CARD_HEADER_NAME_SIZE_PX }}
        >
          <NameOrTitleField
            value={name}
            onChange={setName}
            fontSizePx={CARD_HEADER_NAME_SIZE_PX}
            className="px-0 py-0 text-center"
          />
        </label>
      </div>

      <div className="flex items-center justify-center px-8 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {ready ? <ConfirmButton onClick={handleConfirm} /> : null}
      </div>
    </main>
  );
}
