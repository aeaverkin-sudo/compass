"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useVisualViewport } from "../hooks/use-visual-viewport";
import { AvatarPicker } from "./avatar-picker";
import { ConfirmButton } from "./confirm-button";
import { NameFields } from "./name-fields";

function isFilled(value: string) {
  return value.trim().length > 0;
}

export function LandingPage() {
  const [photo, setPhoto] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [secondName, setSecondName] = useState("");
  const [inputFocused, setInputFocused] = useState(false);

  const { keyboardOpen } = useVisualViewport();
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

  return (
    <main className="compass-main grid h-lvh grid-rows-[1fr_auto_1fr] overflow-hidden bg-transparent">
      <div aria-hidden />

      <div className="flex w-full flex-col items-center px-8">
        <div className="flex w-full max-w-xs flex-col items-center">
          <div
            className={cn(
              "grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out",
              typing
                ? "pointer-events-none mb-0 grid-rows-[0fr] opacity-0"
                : "-translate-y-[2cm] mb-[1.5cm] grid-rows-[1fr] opacity-100",
            )}
          >
            <div className="min-h-0 overflow-hidden">
              <AvatarPicker photo={photo} onPhotoChange={setPhoto} />
            </div>
          </div>

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

      <div className="flex items-center justify-center px-8 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {ready ? <ConfirmButton /> : null}
      </div>
    </main>
  );
}
