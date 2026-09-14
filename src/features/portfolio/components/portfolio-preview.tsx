"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ContentSlot, Portfolio } from "@/shared/types";
import {
  getActiveSlots,
  getFullName,
  isQrReady,
} from "@/features/portfolio/services/portfolio-factory";
import { fileToDataUrl } from "@/shared/lib/utils";
import { isSlotFilled } from "@/features/portfolio/services/content-detector";

interface PortfolioPreviewProps {
  portfolios: Portfolio[];
  currentIndex: number;
  library: ContentSlot[];
  onIndexChange: (index: number) => void;
  onUpdate: (id: string, data: Partial<Portfolio>) => void;
  onAddPortfolio: () => void;
}

const COMPACT_MAX_ITEMS = 3;

function PreviewContent({
  portfolio,
  library,
  expanded,
  onUpdate,
}: {
  portfolio: Portfolio;
  library: ContentSlot[];
  expanded: boolean;
  onUpdate: (data: Partial<Portfolio>) => void;
}) {
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
  };

  if (!hasName && !portfolio.photo) {
    return (
      <div className="flex min-h-[220px] flex-col items-center justify-center px-6 py-8 text-center">
        {editingName === null ? (
          <button
            type="button"
            onClick={() => setEditingName("first")}
            className="text-[15px] tracking-wide text-[#1a1a1a] uppercase"
          >
            Add your first and last name
          </button>
        ) : (
          <div className="flex w-full max-w-xs flex-col gap-3">
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
              <button
                type="button"
                onClick={() => setEditingName(null)}
                className="text-xs text-[#666]"
              >
                Done
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`px-6 py-6 ${expanded ? "min-h-[60vh]" : "min-h-[220px]"}`}
    >
      <div className="flex flex-col items-center">
        {portfolio.photo ? (
          <label className="mb-4 cursor-pointer">
            <img
              src={portfolio.photo}
              alt=""
              className="h-20 w-20 object-cover"
              style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}
            />
            <input type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
          </label>
        ) : showPhotoPrompt ? (
          <label className="mb-4 cursor-pointer border-b border-[#1a1a1a] pb-0.5 text-[13px] tracking-wide text-[#1a1a1a] uppercase">
            Add photo
            <input type="file" accept="image/*" capture="user" className="hidden" onChange={handlePhoto} />
          </label>
        ) : null}

        <div className="mb-2 text-center">
          {editingName === "first" || editingName === "last" ? (
            <div className="flex gap-2">
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
                rows={2}
                className="mb-4 w-full max-w-xs border-b border-[#ccc] bg-transparent text-center text-[13px] text-[#444] outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingName("desc");
                }}
                className="mb-4 max-w-xs text-[13px] text-[#666]"
              >
                {portfolio.description || "Add description"}
              </button>
            )}
          </>
        )}

        {displaySlots.length > 0 && (
          <div className="mt-2 w-full max-w-xs space-y-2 border-t border-[#e8e8e8] pt-4">
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
      </div>
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
}: PortfolioPreviewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const width = el.offsetWidth;
    const index = Math.round(el.scrollLeft / width);
    if (index !== currentIndex && index <= portfolios.length) {
      onIndexChange(Math.min(index, portfolios.length - 1));
    }
  }, [currentIndex, portfolios.length, onIndexChange]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: currentIndex * el.offsetWidth, behavior: "smooth" });
  }, [currentIndex]);

  const toggleExpanded = () => {
    if (isQrReady(portfolios[currentIndex])) {
      setExpanded((v) => !v);
    }
  };

  return (
    <div className="border-y border-[#1a1a1a]/10" style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
      {expanded ? (
        <button type="button" className="w-full text-left" onClick={toggleExpanded}>
          <PreviewContent
            portfolio={portfolios[currentIndex]}
            library={library}
            expanded
            onUpdate={(data) => onUpdate(portfolios[currentIndex].id, data)}
          />
        </button>
      ) : (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex snap-x snap-mandatory overflow-x-auto scrollbar-hide"
        >
          {portfolios.map((p) => (
            <button
              key={p.id}
              type="button"
              className="w-full shrink-0 snap-center text-left"
              onClick={toggleExpanded}
            >
              <PreviewContent
                portfolio={p}
                library={library}
                expanded={false}
                onUpdate={(data) => onUpdate(p.id, data)}
              />
            </button>
          ))}
        </div>
      )}

      {!expanded && portfolios.length > 1 && (
        <p className="pb-2 text-center text-[10px] tracking-widest text-[#aaa] uppercase">
          {portfolios[currentIndex].name}
        </p>
      )}

      {!expanded && (
        <button
          type="button"
          onClick={onAddPortfolio}
          className="block w-full pb-2 text-center text-[10px] text-[#bbb]"
        >
          + portfolio
        </button>
      )}
    </div>
  );
}
