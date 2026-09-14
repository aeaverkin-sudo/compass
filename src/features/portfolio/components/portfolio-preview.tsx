"use client";

import { useRef, useState } from "react";
import type { ContentSlot, Portfolio } from "@/shared/types";
import {
  getActiveSlots,
  getFullName,
  isQrReady,
} from "@/features/portfolio/services/portfolio-factory";
import { fileToDataUrl } from "@/shared/lib/utils";
import { useSwipe } from "@/shared/hooks/use-swipe";

interface PortfolioPreviewProps {
  portfolios: Portfolio[];
  currentIndex: number;
  library: ContentSlot[];
  onIndexChange: (index: number) => void;
  onUpdate: (id: string, data: Partial<Portfolio>) => void;
  onAddPortfolio: () => void;
  onShare?: () => void;
  shareReady?: boolean;
}

const COMPACT_MAX_ITEMS = 3;

function PreviewContent({
  portfolio,
  library,
  expanded,
  onUpdate,
  onShare,
  shareReady,
}: {
  portfolio: Portfolio;
  library: ContentSlot[];
  expanded: boolean;
  onUpdate: (data: Partial<Portfolio>) => void;
  onShare?: () => void;
  shareReady?: boolean;
}) {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [editingName, setEditingName] = useState<"first" | "last" | "desc" | null>(null);
  const activeSlots = getActiveSlots(portfolio, library);
  const displaySlots = expanded ? activeSlots : activeSlots.slice(0, COMPACT_MAX_ITEMS);
  const hasName = portfolio.firstName.trim() || portfolio.lastName.trim();
  const showPhotoPrompt = hasName && !portfolio.photo;
  const qrReady = isQrReady(portfolio);

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onUpdate({ photo: await fileToDataUrl(file) });
    e.target.value = "";
  };

  const openPhotoPicker = (e: React.MouseEvent) => {
    e.stopPropagation();
    photoInputRef.current?.click();
  };

  if (!hasName && !portfolio.photo) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        {editingName === null ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setEditingName("first");
            }}
            className="text-[15px] tracking-wide text-[#1a1a1a] uppercase"
          >
            Add your first and last name
          </button>
        ) : (
          <div className="flex w-full max-w-xs flex-col gap-3" onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              placeholder="First name"
              value={portfolio.firstName}
              onChange={(e) => onUpdate({ firstName: e.target.value })}
              className="border-b border-[#1a1a1a] bg-transparent py-2 text-center text-[15px] outline-none"
            />
            <input
              placeholder="Last name"
              value={portfolio.lastName}
              onChange={(e) => onUpdate({ lastName: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && portfolio.firstName.trim() && portfolio.lastName.trim()) {
                  setEditingName(null);
                }
              }}
              className="border-b border-[#1a1a1a] bg-transparent py-2 text-center text-[15px] outline-none"
            />
            {portfolio.firstName.trim() && portfolio.lastName.trim() && (
              <button type="button" onClick={() => setEditingName(null)} className="text-xs text-[#666]">
                Done
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center overflow-hidden px-6 py-4">
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePhoto}
      />

      {portfolio.photo ? (
        <button
          type="button"
          onClick={openPhotoPicker}
          className="mb-3 cursor-pointer"
          aria-label="Change photo"
        >
          <img
            src={portfolio.photo}
            alt=""
            className="h-20 w-20 object-cover"
            style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}
          />
        </button>
      ) : showPhotoPrompt ? (
        <button
          type="button"
          onClick={openPhotoPicker}
          className="mb-3 border-b border-[#1a1a1a] pb-0.5 text-[13px] tracking-wide text-[#1a1a1a] uppercase"
        >
          Add photo
        </button>
      ) : null}

      <div className="mb-1 text-center">
        {editingName === "first" || editingName === "last" ? (
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              value={portfolio.firstName}
              onChange={(e) => onUpdate({ firstName: e.target.value })}
              className="w-24 border-b border-[#1a1a1a] bg-transparent text-center text-lg outline-none"
            />
            <input
              value={portfolio.lastName}
              onChange={(e) => onUpdate({ lastName: e.target.value })}
              className="w-24 border-b border-[#1a1a1a] bg-transparent text-center text-lg outline-none"
              onBlur={() => setEditingName(null)}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setEditingName("first");
            }}
            className="text-lg font-normal text-[#1a1a1a]"
          >
            {getFullName(portfolio) || "Name"}
          </button>
        )}
      </div>

      {qrReady && (
        <>
          {editingName === "desc" ? (
            <textarea
              autoFocus
              value={portfolio.description}
              onChange={(e) => onUpdate({ description: e.target.value })}
              onBlur={() => setEditingName(null)}
              onClick={(e) => e.stopPropagation()}
              rows={2}
              className="mb-2 w-full max-w-xs border-b border-[#ccc] bg-transparent text-center text-[13px] text-[#444] outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setEditingName("desc");
              }}
              className="mb-2 max-w-xs text-[13px] text-[#666]"
            >
              {portfolio.description || "Add description"}
            </button>
          )}
        </>
      )}

      {displaySlots.length > 0 && (
        <div className="mt-1 w-full max-w-xs space-y-1.5 overflow-hidden border-t border-[#e8e8e8] pt-3">
          {displaySlots.map((slot) => (
            <div key={slot.id} className="text-[13px] text-[#1a1a1a]">
              <p className={expanded ? "font-medium" : ""}>{slot.label}</p>
              {slot.type === "link" && expanded && (
                <p className="text-[11px] text-[#888]">{slot.value.replace(/^https?:\/\//, "")}</p>
              )}
              {slot.type === "text" && expanded && (
                <p className="text-[11px] text-[#888]">{slot.value}</p>
              )}
            </div>
          ))}
          {!expanded && activeSlots.length > COMPACT_MAX_ITEMS && (
            <p className="text-[11px] text-[#aaa]">+{activeSlots.length - COMPACT_MAX_ITEMS} more</p>
          )}
        </div>
      )}

      {shareReady && onShare && qrReady && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onShare();
          }}
          className="mt-4 text-[11px] tracking-wide text-[#666] uppercase"
        >
          Share
        </button>
      )}
    </div>
  );
}

export function PortfolioPreview({
  portfolios,
  currentIndex,
  library,
  onIndexChange,
  onUpdate,
  onAddPortfolio,
  onShare,
  shareReady,
}: PortfolioPreviewProps) {
  const [expanded, setExpanded] = useState(false);
  const portfolio = portfolios[currentIndex];

  const swipe = useSwipe({
    onSwipeLeft: () => {
      if (expanded || currentIndex >= portfolios.length - 1) return;
      onIndexChange(currentIndex + 1);
    },
    onSwipeRight: () => {
      if (expanded || currentIndex <= 0) return;
      onIndexChange(currentIndex - 1);
    },
  });

  const toggleExpanded = () => {
    if (isQrReady(portfolio)) setExpanded((v) => !v);
  };

  return (
    <div
      className="relative h-[280px] touch-none overflow-hidden border-y border-[#1a1a1a]/10"
      style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}
      {...(expanded ? {} : swipe)}
    >
      <div
        role="button"
        tabIndex={0}
        className="h-full w-full cursor-default"
        onClick={toggleExpanded}
        onKeyDown={(e) => e.key === "Enter" && toggleExpanded()}
      >
        <PreviewContent
          portfolio={portfolio}
          library={library}
          expanded={expanded}
          onUpdate={(data) => onUpdate(portfolio.id, data)}
          onShare={onShare}
          shareReady={shareReady}
        />
      </div>

      {!expanded && portfolios.length > 1 && (
        <p className="pointer-events-none absolute bottom-7 left-0 right-0 text-center text-[10px] tracking-widest text-[#aaa] uppercase">
          {portfolio.name}
        </p>
      )}

      {!expanded && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAddPortfolio();
          }}
          className="absolute bottom-1 left-0 right-0 text-center text-[10px] text-[#bbb]"
        >
          + portfolio
        </button>
      )}
    </div>
  );
}
