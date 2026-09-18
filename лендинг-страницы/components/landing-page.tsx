"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
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

  const ready = useMemo(
    () => Boolean(photo) && isFilled(firstName) && isFilled(secondName),
    [photo, firstName, secondName],
  );

  return (
    <main
      className={cn(
        "compass-main grid min-h-dvh grid-rows-[1fr_auto_1fr] transition-[background-color] duration-500 ease-out",
        ready ? "compass-ready bg-background-ready" : "bg-background",
      )}
    >
      <div aria-hidden />

      <div className="flex w-full flex-col items-center px-8">
        <div className="flex w-full max-w-xs flex-col items-center">
          <AvatarPicker photo={photo} onPhotoChange={setPhoto} />
          <div className="mt-[1.5cm] w-full">
            <NameFields
              firstName={firstName}
              secondName={secondName}
              onFirstNameChange={setFirstName}
              onSecondNameChange={setSecondName}
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
