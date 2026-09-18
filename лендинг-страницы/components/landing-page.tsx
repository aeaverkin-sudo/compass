"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useLockedAnchorTop } from "../hooks/use-locked-anchor-top";
import { useVisualViewportOffset } from "../hooks/use-visual-viewport-offset";
import { AvatarPicker } from "./avatar-picker";
import { ConfirmButton } from "./confirm-button";
import { NameFields } from "./name-fields";

function isFilled(value: string) {
  return value.trim().length > 0;
}

const AVATAR_SIZE_PX = 149.76;

export function LandingPage() {
  const [photo, setPhoto] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [secondName, setSecondName] = useState("");

  const viewportOffsetTop = useVisualViewportOffset();
  const keyboardOpen = viewportOffsetTop > 0;
  const { anchorRef, top: photoTop } = useLockedAnchorTop(keyboardOpen);

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

  const avatar = <AvatarPicker photo={photo} onPhotoChange={setPhoto} />;
  const photoPinned = photoTop !== null;

  return (
    <main className="compass-main relative h-lvh overflow-hidden bg-transparent">
      {photoPinned ? (
        <div
          className="pointer-events-none fixed inset-x-0 z-10 flex justify-center"
          style={{ top: photoTop, transform: `translateY(${viewportOffsetTop}px)` }}
        >
          <div className="pointer-events-auto">{avatar}</div>
        </div>
      ) : null}

      <div className="grid h-full grid-rows-[1fr_auto_1fr]">
        <div aria-hidden />

        <div className="flex w-full flex-col items-center px-8">
          <div className="flex w-full max-w-xs flex-col items-center">
            <div
              ref={anchorRef}
              aria-hidden={photoPinned}
              className={cn(
                "shrink-0 -translate-y-[2cm]",
                photoPinned ? "pointer-events-none invisible" : undefined,
              )}
              style={{ width: AVATAR_SIZE_PX, height: AVATAR_SIZE_PX }}
            >
              {!photoPinned ? avatar : null}
            </div>
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
      </div>
    </main>
  );
}
