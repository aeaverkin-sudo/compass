"use client";

import type { CardSnapshot } from "@/shared/types";
import {
  getSnapshotDisplayName,
  getSnapshotItems,
  typeLabel,
} from "@/features/portfolio/services/contact-item";
import { ContactIcon } from "./contact-icon";
import { MapPin } from "lucide-react";

interface SharedPortfolioViewProps {
  snapshot: CardSnapshot;
}

export function SharedPortfolioView({ snapshot }: SharedPortfolioViewProps) {
  const displayName = getSnapshotDisplayName(snapshot);
  const items = getSnapshotItems(snapshot);

  return (
    <div className="bg-[#faf9f7] px-6 py-8" style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
      <div className="flex flex-col items-center text-center">
        {snapshot.photo && (
          <img
            src={snapshot.photo}
            alt=""
            className="mb-4 h-20 w-20 rounded-full object-cover"
            style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}
          />
        )}
        <h2 className="text-lg font-semibold text-[#1a1a1a]">{displayName}</h2>
        {snapshot.title && <p className="mt-1 text-[13px] text-[#666]">{snapshot.title}</p>}
        {snapshot.subtitle && <p className="text-[12px] text-[#888]">{snapshot.subtitle}</p>}
        {snapshot.description && (
          <p className="mt-1 text-[11px] text-[#aaa]">{snapshot.description}</p>
        )}

        {items.length > 0 && (
          <div className="mt-6 grid w-full max-w-xs grid-cols-2 gap-2 border-t border-[#e8e8e8] pt-4">
            {items.map((item) => (
              <a
                key={item.id}
                href={item.url || undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2 rounded-xl bg-[#f7f7f7] p-3 text-left"
              >
                <ContactIcon type={item.type} size={16} className="mt-0.5 text-[#555]" />
                <div className="min-w-0">
                  <p className="text-[10px] text-[#888]">{typeLabel(item.type)}</p>
                  <p className="truncate text-[12px] font-medium text-[#1a1a1a]">
                    {item.label || item.value.replace(/^https?:\/\//, "")}
                  </p>
                </div>
              </a>
            ))}
          </div>
        )}

        {snapshot.location && (
          <div className="mt-4 flex items-center gap-1 text-[11px] text-[#aaa]">
            <MapPin size={12} strokeWidth={1.5} />
            {snapshot.location}
          </div>
        )}

        {snapshot.nextScanAddon && (
          <div className="mt-6 w-full max-w-xs rounded-xl border border-[#eee] bg-white p-4 text-left">
            {snapshot.nextScanAddon.type === "text" && (
              <p className="text-[13px] text-[#1a1a1a]">{snapshot.nextScanAddon.content}</p>
            )}
            {snapshot.nextScanAddon.type === "voice" && (
              <p className="text-[13px] italic text-[#666]">{snapshot.nextScanAddon.content}</p>
            )}
            {snapshot.nextScanAddon.type === "selfie" && (
              <img
                src={snapshot.nextScanAddon.content}
                alt=""
                className="mx-auto max-h-48 rounded-lg object-cover"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
