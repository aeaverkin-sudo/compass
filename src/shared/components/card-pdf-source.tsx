"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cardSheetsToPdf } from "@/shared/services/card-pdf-file";
import { cardPdfFilename } from "@/shared/services/card-pdf-name";
import { beginCardPdf, failCardPdf, publishCardPdf, type CardPdfInput } from "@/shared/services/save-public-card-pdf";
import { blockHeights, packPdfBlocks, PDF_BAND_H, PDF_PAD, PDF_PAGE_H, PDF_PAGE_W } from "@/shared/services/pdf-pages";

type CardPdfSourceProps = {
  input: CardPdfInput;
  registerUrl: string;
  /** Bumps when the saved card changes, so the hidden sheets are painted again. */
  epoch: number;
  children: (mask: number[] | null) => ReactNode;
};

function waitFrames(count: number) {
  return new Promise<void>((resolve) => {
    const step = (left: number) => {
      if (left <= 0) resolve();
      else requestAnimationFrame(() => step(left - 1));
    };
    step(count);
  });
}

async function waitForPaint(root: HTMLElement) {
  await document.fonts?.ready;
  await waitFrames(2);
  const images = [...root.querySelectorAll("img")];
  await Promise.all(
    images.map((image) =>
      image.complete
        ? Promise.resolve()
        : image.decode().catch(() => undefined),
    ),
  );
}

function AccountBand({ href }: { href: string }) {
  return (
    <div
      className="mt-auto flex w-full shrink-0 items-center justify-end bg-sky"
      style={{ height: PDF_BAND_H, paddingRight: PDF_PAD, paddingLeft: PDF_PAD }}
    >
      <a
        href={href}
        className="text-[#111]"
        style={{
          fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
          fontWeight: 300,
          fontSize: 13,
          lineHeight: 1.2,
          textDecoration: "underline",
          textDecorationColor: "rgba(17,17,17,0.28)",
          textDecorationThickness: "0.5px",
          textUnderlineOffset: "3px",
        }}
      >
        Get your account
      </a>
    </div>
  );
}

/**
 * Hidden print of the public card. Pages are the same component as `/c/`.
 * The sky plaque, with one registration link, sits on the last sheet only.
 */
export function CardPdfSource({ input, registerUrl, epoch, children }: CardPdfSourceProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef(input);
  inputRef.current = input;
  const [groups, setGroups] = useState<number[][] | null>(null);
  const cacheKey = `${input.publicToken}\n${input.revision ?? ""}\n${input.displayName}\n${epoch}\n${(input.notes ?? [])
    .map((note) => `${note.id}:${note.type}:${note.attachmentId ?? ""}:${note.content}`)
    .join("|")}`;
  const [stamp, setStamp] = useState(cacheKey);
  if (stamp !== cacheKey) {
    setStamp(cacheKey);
    setGroups(null);
  }

  useEffect(() => {
    beginCardPdf(inputRef.current);
  }, [cacheKey]);

  useEffect(() => {
    const root = hostRef.current;
    if (!root || groups) return;
    let cancel = false;
    void (async () => {
      await waitForPaint(root);
      if (cancel || !hostRef.current) return;
      const blocks = [...hostRef.current.querySelectorAll<HTMLElement>("[data-pdf-block]")];
      if (blocks.length === 0) {
        failCardPdf(inputRef.current, new Error("The card has nothing to print"));
        return;
      }
      setGroups(packPdfBlocks(blockHeights(blocks), PDF_PAGE_H, PDF_BAND_H));
    })();
    return () => {
      cancel = true;
    };
  }, [groups, cacheKey]);

  useEffect(() => {
    const root = hostRef.current;
    if (!root || !groups) return;
    let cancel = false;
    void (async () => {
      try {
        await waitForPaint(root);
        if (cancel || !hostRef.current) return;
        const pages = [...hostRef.current.querySelectorAll<HTMLElement>("[data-pdf-page]")];
        if (pages.length === 0) {
          failCardPdf(inputRef.current, new Error("The card has nothing to print"));
          return;
        }
        const bytes = await cardSheetsToPdf(pages);
        if (cancel) return;
        const copy = new Uint8Array(bytes.byteLength);
        copy.set(bytes);
        const current = inputRef.current;
        publishCardPdf(current, {
          blob: new Blob([copy], { type: "application/pdf" }),
          filename: cardPdfFilename(current.displayName),
        });
      } catch (error) {
        if (!cancel) failCardPdf(inputRef.current, error);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [groups, cacheKey]);

  const sheets =
    groups == null ? (
      <div style={{ width: PDF_PAGE_W }}>{children(null)}</div>
    ) : (
      groups.map((indexes, page) => (
        <div
          key={`${cacheKey}:${page}`}
          data-pdf-page=""
          className="flex shrink-0 flex-col overflow-hidden bg-white"
          style={{ width: PDF_PAGE_W, height: PDF_PAGE_H }}
        >
          {children(indexes)}
          {page === groups.length - 1 ? <AccountBand href={registerUrl} /> : null}
        </div>
      ))
    );

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={hostRef}
      aria-hidden
      className="pointer-events-none fixed top-0 -z-10"
      style={{ left: -PDF_PAGE_W - 32 }}
    >
      {sheets}
    </div>,
    document.body,
  );
}
