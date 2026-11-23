"use client";

import { memo, type ComponentProps } from "react";
import { TabBand } from "./tab-band";
import { MainTabs } from "./main-tabs";

/** Fires on the finger lifting; the click Safari sends after it is dropped, keyboard clicks still work. */
function TapButton({ onTap, ...props }: Omit<ComponentProps<"button">, "onClick" | "onPointerUp"> & { onTap: () => void }) {
  return (
    <button
      type="button"
      {...props}
      onPointerUp={(event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        onTap();
      }}
      onClick={(event) => {
        if (event.detail === 0) onTap();
      }}
    />
  );
}

type BottomNavProps = {
  /** Edit mode: Delete on the left, Save on the right. The new-section plus sits in the portfolio. */
  editing?: boolean;
  onRemove?: () => void;
  onDone?: () => void;
};

export const BottomNav = memo(function BottomNav({
  editing = false,
  onRemove,
  onDone,
}: BottomNavProps) {
  if (!editing) return <MainTabs current="portfolio" />;

  return (
    <TabBand
      left={
        <TapButton className="flex h-full min-h-11 w-full items-center uppercase" onTap={() => onRemove?.()}>
          Delete
        </TapButton>
      }
      right={
        <TapButton
          className="flex h-full min-h-11 w-full items-center justify-end uppercase"
          onTap={() => onDone?.()}
        >
          Save
        </TapButton>
      }
    />
  );
});
