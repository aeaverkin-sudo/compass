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
  onExpandedChange: (expanded: boolean) => void;
  onShare?: () => void;
  shareReady?: boolean;
}

const COMPACT_MAX = 3;

export function PortfolioPreview({
  portfolios,
  currentIndex,
  library,
  onIndexChange,
  onUpdate,
  onExpandedChange,
  onShare,
  shareReady,
}: PortfolioPreviewProps) {
  const [expanded, setExpanded] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
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

  const activeSlots = getActiveSlots(portfolio, library);
  const displaySlots = expanded ? activeSlots : activeSlots.slice(0, COMPACT_MAX);
  const hasName = portfolio.firstName.trim() || portfolio.lastName.trim();
  const qrReady = isQrReady(portfolio);
  const fullName = getFullName(portfolio);

  const toggleExpanded = () => {
    if (!qrReady && hasName) return;
    if (!hasName) return;
    const next = !expanded;
    setExpanded(next);
    onExpandedChange(next);
  };

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onUpdate(portfolio.id, { photo: await fileToDataUrl(file) });
    e.target.value = "";
  };

  const openPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    photoInputRef.current?.click();
  };

  /* State 1 — empty */
  if (!hasName && !portfolio.photo) {
    return (
      <div className="flex h-[260px] items-center justify-center border-y border-[#1a1a1a]/10 px-6">
        {editingName ? (
          <div className="flex w-full max-w-xs flex-col gap-2" onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              placeholder="First name"
              value={portfolio.firstName}
              onChange={(e) => onUpdate(portfolio.id, { firstName: e.target.value })}
              className="border-b border-[#1a1a1a] bg-transparent py-2 text-center text-[15px] uppercase outline-none"
            />
            <input
              placeholder="Last name"
              value={portfolio.lastName}
              onChange={(e) => onUpdate(portfolio.id, { lastName: e.target.value })}
              className="border-b border-[#1a1a1a] bg-transparent py-2 text-center text-[15px] uppercase outline-none"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditingName(true)}
            className="text-[15px] tracking-wide text-[#1a1a1a] uppercase"
          >
            Add your first and last name
          </button>
        )}
      </div>
    );
  }

  /* State 2 — name, no photo */
  if (hasName && !portfolio.photo) {
    return (
      <div className="flex h-[260px] flex-col items-center justify-center border-y border-[#1a1a1a]/10 px-6">
        <input ref={photoInputRef} type="file" accept="image/*" capture="user" className="hidden" onChange={handlePhoto} />
        {editingName ? (
          <div className="mb-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              value={portfolio.firstName}
              onChange={(e) => onUpdate(portfolio.id, { firstName: e.target.value })}
              onBlur={() => setEditingName(false)}
              className="w-28 border-b border-[#1a1a1a] bg-transparent text-center text-lg outline-none"
            />
            <input
              value={portfolio.lastName}
              onChange={(e) => onUpdate(portfolio.id, { lastName: e.target.value })}
              onBlur={() => setEditingName(false)}
              className="w-28 border-b border-[#1a1a1a] bg-transparent text-center text-lg outline-none"
            />
          </div>
        ) : (
          <button type="button" onClick={() => setEditingName(true)} className="mb-3 text-lg text-[#1a1a1a]">
            {fullName}
          </button>
        )}
        <button
          type="button"
          onClick={openPhoto}
          className="border-b border-[#1a1a1a] pb-0.5 text-[13px] tracking-wide uppercase"
        >
          Add photo
        </button>
      </div>
    );
  }

  /* State 3+ — full card */
  const zoneClass = expanded
    ? "fixed inset-x-0 top-[200px] bottom-20 z-30 flex flex-col overflow-y-auto border-y border-[#1a1a1a]/10 bg-[#faf9f7] px-6 py-8"
    : "relative flex h-[260px] touch-none flex-col items-center justify-center overflow-hidden border-y border-[#1a1a1a]/10 px-6 py-4";

  return (
    <div className={zoneClass} {...(expanded ? {} : swipe)} onClick={toggleExpanded}>
      <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />

      <button type="button" onClick={openPhoto} className="mb-3">
        <img
          src={portfolio.photo}
          alt=""
          className="h-20 w-20 object-cover"
          style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}
        />
      </button>

      {editingName ? (
        <div className="mb-2 flex gap-2" onClick={(e) => e.stopPropagation()}>
          <input
            autoFocus
            value={portfolio.firstName}
            onChange={(e) => onUpdate(portfolio.id, { firstName: e.target.value })}
            onBlur={() => setEditingName(false)}
            className="w-28 border-b border-[#1a1a1a] bg-transparent text-center text-lg outline-none"
          />
          <input
            value={portfolio.lastName}
            onChange={(e) => onUpdate(portfolio.id, { lastName: e.target.value })}
            onBlur={() => setEditingName(false)}
            className="w-28 border-b border-[#1a1a1a] bg-transparent text-center text-lg outline-none"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setEditingName(true);
          }}
          className="mb-1 text-lg text-[#1a1a1a]"
        >
          {fullName}
        </button>
      )}

      {editingDesc ? (
        <textarea
          autoFocus
          value={portfolio.description}
          onChange={(e) => onUpdate(portfolio.id, { description: e.target.value })}
          onBlur={() => setEditingDesc(false)}
          onClick={(e) => e.stopPropagation()}
          rows={expanded ? 4 : 2}
          className="mb-2 w-full max-w-xs border-b border-[#ccc] bg-transparent text-center text-[13px] text-[#666] outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setEditingDesc(true);
          }}
          className="mb-2 max-w-xs text-[13px] text-[#666]"
        >
          {portfolio.description}
        </button>
      )}

      {displaySlots.length > 0 && (
        <div className="mt-2 w-full max-w-xs space-y-1.5 border-t border-[#e8e8e8] pt-3">
          {displaySlots.map((slot) => (
            <div key={slot.id} className="text-[13px] text-[#1a1a1a]">
              <p className={expanded ? "font-medium" : ""}>{slot.label}</p>
              {expanded && slot.type === "link" && (
                <p className="text-[11px] text-[#888]">{slot.value.replace(/^https?:\/\//, "")}</p>
              )}
            </div>
          ))}
          {!expanded && activeSlots.length > COMPACT_MAX && (
            <p className="text-[11px] text-[#aaa]">+{activeSlots.length - COMPACT_MAX}</p>
          )}
        </div>
      )}

      {!expanded && shareReady && onShare && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onShare();
          }}
          className="mt-3 text-[11px] tracking-wide text-[#666] uppercase"
        >
          Share
        </button>
      )}

      {!expanded && portfolios.length > 1 && (
        <p className="pointer-events-none absolute bottom-2 text-[10px] tracking-widest text-[#aaa] uppercase">
          {portfolio.name}
        </p>
      )}
    </div>
  );
}
