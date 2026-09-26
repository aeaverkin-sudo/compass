"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { NameOrTitleField } from "@/shared/components/name-or-title-field";
import { uploadAttachment } from "@/shared/services/attachment-upload";
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
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
    if (saving || !photo || !photoFile || !isFilled(name)) return;
    const existingId = useAppStore.getState().cards[0]?.id;
    const cardId =
      existingId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(existingId)
        ? existingId
        : crypto.randomUUID();
    setSaving(true);
    setSaveError(null);
    void uploadAttachment({ file: photoFile, kind: "card-photo", cardId })
      .then((ready) => {
        completeOnboarding({
          displayName: name.trim(),
          photoAttachmentId: ready.attachmentId,
          cardId,
        });
        router.push("/main");
      })
      .catch((error: unknown) => {
        setSaving(false);
        setSaveError(error instanceof Error ? error.message : "Could not save the photo");
      });
  };

  return (
    <main className="compass-main flex h-lvh flex-col overflow-hidden bg-transparent">
      <div className="flex flex-1 flex-col items-center justify-center px-8 pb-[14vh]">
        <PhotoSlotPicker
          photo={photo}
          onPhotoChange={(next, file) => {
            setPhoto(next);
            setPhotoFile(file ?? null);
            setSaveError(null);
          }}
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

      <div className="flex items-center justify-center px-8 pb-[calc(max(1.5rem,env(safe-area-inset-bottom))+1cm)]">
        {saveError ? (
          <p className="mb-3 px-6 text-center text-[12px] leading-snug text-[#111]">{saveError}</p>
        ) : null}
        {ready ? <ConfirmButton onClick={handleConfirm} /> : null}
      </div>
    </main>
  );
}
