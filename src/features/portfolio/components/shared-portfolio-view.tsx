"use client";

import type { PortfolioSnapshot } from "@/shared/types";

interface SharedPortfolioViewProps {
  snapshot: PortfolioSnapshot;
}

export function SharedPortfolioView({ snapshot }: SharedPortfolioViewProps) {
  const fullName = [snapshot.firstName, snapshot.lastName].filter(Boolean).join(" ");

  return (
    <div className="bg-[#faf9f7] px-6 py-8" style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
      <div className="flex flex-col items-center text-center">
        {snapshot.photo && (
          <img
            src={snapshot.photo}
            alt=""
            className="mb-4 h-20 w-20 object-cover"
            style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}
          />
        )}
        <h2 className="text-lg text-[#1a1a1a]">{fullName || snapshot.name}</h2>
        {snapshot.description && (
          <p className="mt-2 text-[13px] text-[#666]">{snapshot.description}</p>
        )}
        {snapshot.slots.length > 0 && (
          <div className="mt-6 w-full max-w-xs space-y-2 border-t border-[#e8e8e8] pt-4 text-left">
            {snapshot.slots.map((slot) => (
              <div key={slot.id} className="text-[13px]">
                <p className="text-[#1a1a1a]">{slot.label}</p>
                {slot.type === "link" && (
                  <a
                    href={slot.value.startsWith("http") ? slot.value : `https://${slot.value}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-[#888] underline"
                  >
                    {slot.value.replace(/^https?:\/\//, "")}
                  </a>
                )}
                {slot.type === "text" && (
                  <p className="text-[11px] text-[#888]">{slot.value}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
