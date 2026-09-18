"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/shared/store/app-store";
import { useVisualViewport } from "../hooks/use-visual-viewport";
import { AvatarPicker } from "./avatar-picker";
import { ConfirmButton } from "./confirm-button";
import { NameFields } from "./name-fields";

function isFilled(value: string) {
  return value.trim().length > 0;
}

function resetDocumentScroll() {
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

export function LandingPage() {
  const router = useRouter();
  const [photo, setPhoto] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [secondName, setSecondName] = useState("");
  const [inputFocused, setInputFocused] = useState(false);

  const completeOnboarding = useAppStore((state) => state.completeOnboarding);
  const { keyboardOpen, offsetTop } = useVisualViewport();
  const typing = inputFocused || keyboardOpen;

  const ready = useMemo(
    () => Boolean(photo) && isFilled(firstName) && isFilled(secondName),
    [photo, firstName, secondName],
  );

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

  useEffect(() => {
    if (!typing) return;
    resetDocumentScroll();
  }, [typing, offsetTop]);

  const handleConfirm = () => {
    if (!photo || !isFilled(firstName) || !isFilled(secondName)) return;
    completeOnboarding({
      photo,
      firstName: firstName.trim(),
      secondName: secondName.trim(),
    });
    router.push("/main");
  };

  return (
    <main
      className={cn(
        "compass-main h-lvh overflow-hidden bg-transparent",
        typing ? "flex flex-col" : "grid grid-rows-[1fr_auto_1fr]",
      )}
    >
      {!typing ? <div aria-hidden /> : null}

      <div
        className={cn(
          "flex w-full flex-col items-center px-8",
          typing ? "shrink-0 pt-[max(0.5rem,env(safe-area-inset-top))]" : undefined,
        )}
        style={typing ? { transform: `translateY(${offsetTop}px)` } : undefined}
      >
        <div className="flex w-full max-w-xs flex-col items-center">
          {!typing ? (
            <div className="-translate-y-[2cm] mb-[1.5cm]">
              <AvatarPicker photo={photo} onPhotoChange={setPhoto} />
            </div>
          ) : null}

          <div className="w-full">
            <NameFields
              firstName={firstName}
              secondName={secondName}
              onFirstNameChange={setFirstName}
              onSecondNameChange={setSecondName}
              onFocusChange={setInputFocused}
            />
          </div>
        </div>
      </div>

      {!typing ? (
        <div className="flex items-center justify-center px-8 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {ready ? <ConfirmButton onClick={handleConfirm} /> : null}
        </div>
      ) : null}
    </main>
  );
}
