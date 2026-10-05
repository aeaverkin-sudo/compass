"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { NameOrTitleField } from "@/shared/components/name-or-title-field";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { uploadAttachment } from "@/shared/services/attachment-upload";
import { recordConsent } from "@/shared/services/consent-client";
import { isEventJoinPath } from "@/shared/event/lookup";
import { upsertCardScalars } from "@/shared/services/card-sync";
import { startTrialClock } from "@/shared/services/trial-client";
import { useAppStore } from "@/shared/store/app-store";
import { CARD_HEADER_NAME_SIZE_PX, CARD_PHOTO_SIZE_PX } from "@main/layout";
import { ConfirmButton } from "./confirm-button";
import { PhotoSlotPicker } from "./photo-slot-picker";

function isFilled(value: string) {
  return value.trim().length > 0;
}

/** Another portfolio, the same way Profile adds one, then saved before leaving. */
async function addFreshPortfolio(displayName: string, photoAttachmentId: string) {
  const response = await fetch("/api/account/status", { cache: "no-store" });
  if (!response.ok) throw new Error("Could not save the card");
  const status = (await response.json()) as { portfolioLimit?: number };
  const limit = status.portfolioLimit;
  if (typeof limit !== "number") throw new Error("Could not save the card");
  const before = useAppStore.getState().cards.length;
  if (before >= limit) throw new Error("Could not add a portfolio.");
  useAppStore.getState().updateSecondCardDraft({ displayName, photoAttachmentId }, limit);
  const cards = useAppStore.getState().cards;
  const card = cards.length === before + 1 ? cards[cards.length - 1] : null;
  if (!card) throw new Error("Could not save the card");
  const user = useAppStore.getState().user;
  if (!user.onboarded) useAppStore.setState({ user: { ...user, onboarded: true } });
  await upsertCardScalars(card);
  const saved = await createBrowserSupabaseClient().from("cards").select("id").eq("id", card.id).maybeSingle();
  if (!saved.data) throw new Error("Could not save the card");
}

export function LandingPage({ next = null, fresh = false }: { next?: string | null; fresh?: boolean }) {
  const router = useRouter();
  const after = next && isEventJoinPath(next) ? next : "/main";
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
    const cardId = fresh
      ? crypto.randomUUID()
      : existingId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(existingId)
        ? existingId
        : crypto.randomUUID();
    const file = photoFile;
    const displayName = name.trim();
    setSaving(true);
    setSaveError(null);
    void (async () => {
      const { data } = await createBrowserSupabaseClient().auth.getUser();
      const registered = Boolean(data.user && !data.user.is_anonymous);
      if (!registered) {
        await recordConsent("trial");
        await startTrialClock();
      }
      const uploaded = await uploadAttachment({ file, kind: "card-photo", cardId });
      if (fresh) {
        await addFreshPortfolio(displayName, uploaded.attachmentId);
      } else {
        completeOnboarding({
          displayName,
          photoAttachmentId: uploaded.attachmentId,
          cardId,
        });
        if (after !== "/main") {
          const card = useAppStore.getState().cards.find((entry) => entry.id === cardId);
          if (card) await upsertCardScalars(card);
          const saved = await createBrowserSupabaseClient().from("cards").select("id").eq("id", cardId).maybeSingle();
          if (!saved.data) throw new Error("Could not save the card");
        }
      }
      router.push(after);
    })().catch((error: unknown) => {
      setSaving(false);
      setSaveError(error instanceof Error ? error.message : "Could not save the photo");
    });
  };

  return (
    <main className="compass-main flex h-svh flex-col overflow-hidden bg-transparent">
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
        {ready ? <ConfirmButton onClick={handleConfirm} disabled={saving} /> : null}
      </div>
    </main>
  );
}
