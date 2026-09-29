"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sheet, SheetContent } from "@/shared/components/ui/sheet";
import { ConsentLine } from "@/shared/components/consent-line";
import { NameOrTitleField } from "@/shared/components/name-or-title-field";
import { uploadAttachment } from "@/shared/services/attachment-upload";
import { recordConsent } from "@/shared/services/consent-client";
import { startTrialClock } from "@/shared/services/trial-client";
import { useAppStore } from "@/shared/store/app-store";
import { CARD_HEADER_NAME_SIZE_PX, CARD_PHOTO_SIZE_PX } from "@main/layout";
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
  const [accepted, setAccepted] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

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
    if (saving || !photo || !photoFile || !isFilled(name) || !accepted) return;
    const existingId = useAppStore.getState().cards[0]?.id;
    const cardId =
      existingId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(existingId)
        ? existingId
        : crypto.randomUUID();
    setSaving(true);
    setSaveError(null);
    void recordConsent("trial")
      .then(() => startTrialClock())
      .then(() => uploadAttachment({ file: photoFile, kind: "card-photo", cardId }))
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
          borderRadiusPx={0}
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

      <div className="flex flex-col items-center justify-center px-8 pb-6">
        {saveError ? (
          <p className="mb-3 px-6 text-center text-[12px] leading-snug text-[#111]">{saveError}</p>
        ) : null}
        {ready ? (
          <>
            <ConsentLine checked={accepted} onCheckedChange={setAccepted} />
            <ConfirmButton onClick={handleConfirm} disabled={!accepted || saving} />
          </>
        ) : null}
      </div>
      <nav className="bg-sky px-[calc(clamp(24px,6.1vw,28px)-3mm)] pb-[env(safe-area-inset-bottom)] text-[12px] leading-[1.45] font-normal tracking-[0.1em] text-[#111] uppercase">
        <div className="grid grid-cols-2 items-baseline">
          <Link href="/register?signin=1" className="justify-self-start px-2 py-4">
            Sign in
          </Link>
          <button type="button" className="justify-self-end px-2 py-4 uppercase" onClick={() => setAboutOpen(true)}>
            About
          </button>
        </div>
      </nav>
      <Sheet open={aboutOpen} onOpenChange={setAboutOpen}>
        <SheetContent aria-label="About">
          <p className="max-w-sm text-[15.5px] leading-[1.45] font-normal tracking-[-0.015em]">
            ADED ME — your portfolio, your people, all in order.
          </p>
          <p className="mt-3 max-w-sm text-[15.5px] leading-[1.45] font-normal tracking-[-0.015em]">
            Build a few cards, share them in seconds. Everyone you meet gets a PDF of you — work, links, socials,
            files — so you never get lost in a phone. Made for events, parties, and every good introduction. More than
            contact details: drop in your PDFs, your links, your socials.
          </p>
          <p className="mt-4 text-[15.5px] leading-[1.45] font-normal tracking-[-0.015em]">
            <Link href="/terms" className="underline">
              Terms
            </Link>
            {" · "}
            <Link href="/privacy" className="underline">
              Privacy
            </Link>
          </p>
        </SheetContent>
      </Sheet>
    </main>
  );
}
