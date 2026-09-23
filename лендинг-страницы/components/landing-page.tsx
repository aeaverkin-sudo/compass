"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/shared/store/app-store";
import { AvatarPicker } from "./avatar-picker";
import { ConfirmButton } from "./confirm-button";
import { NameFields } from "./name-fields";

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
      <div className="flex w-full flex-col items-center px-8 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <div className="flex w-full max-w-xs flex-col items-center">
          <div className="mb-[1.5cm]">
            <AvatarPicker photo={photo} onPhotoChange={setPhoto} />
          </div>
          <NameFields name={name} onNameChange={setName} />
        </div>
      </div>

      <div className="mt-auto flex items-center justify-center px-8 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {ready ? <ConfirmButton onClick={handleConfirm} /> : null}
      </div>
    </main>
  );
}
