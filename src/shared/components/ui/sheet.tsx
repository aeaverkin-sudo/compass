"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

function Sheet({ ...props }: React.ComponentProps<typeof Dialog.Root>) {
  return <Dialog.Root data-slot="sheet" {...props} />;
}

function SheetContent({ className, children, ...props }: React.ComponentProps<typeof Dialog.Content>) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-[#111]/20" />
      <Dialog.Content
        data-slot="sheet-content"
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto bg-white px-8 pt-8 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-[#111] outline-none",
          className,
        )}
        style={{ animation: "compass-sheet-up 280ms ease-out" }}
        {...props}
      >
        <style>{`@keyframes compass-sheet-up { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
        {children}
        <Dialog.Close
          aria-label="Close"
          className="absolute top-4 right-6 inline-flex size-10 items-center justify-center text-[#111]"
        >
          <X className="size-5" strokeWidth={1.5} aria-hidden />
        </Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  );
}

export { Sheet, SheetContent };
