"use client";

import { forwardRef, useCallback, useRef, type MouseEvent, type ReactNode } from "react";
import { Share } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Card, ContactItem } from "@/shared/types";
import { useAppStore } from "@/shared/store/app-store";
import { PhotoSlotPicker } from "@landing/components/photo-slot-picker";
import { CardNameField } from "./card-name-field";
import { getCardItems, getNextScanAddons } from "@/shared/services/card-snapshot";
import { composeCard } from "@/shared/services/card-zones";
import { ContactItemChipList } from "./contact-item-chip";
import { NextScanMenu } from "./next-scan-menu";
import { browseCardHeight, CARD_HEADER_NAME_SIZE_PX, type MainScreenMode } from "../layout";

function splitHeroName(name: string) {
  const trimmed = name.trim();
  const space = trimmed.indexOf(" ");
  if (space < 0) return [trimmed, ""] as const;
  return [trimmed.slice(0, space), trimmed.slice(space + 1)] as const;
}

function EditorialHeader({
  card,
  positionTitle,
  shareToken,
  showPlus,
  nextScan,
  onPhotoChange,
  onDisplayNameChange,
}: {
  card: Card;
  positionTitle?: string;
  shareToken: string;
  showPlus: boolean;
  nextScan: ReactNode;
  onPhotoChange?: (photo: string | null) => void;
  onDisplayNameChange?: (displayName: string) => void;
}) {
  const [first, second] = splitHeroName(card.displayName);
  const share = () => {
    const url = `${window.location.origin}/api/share/${shareToken}/pdf`;
    if (navigator.share) {
      void navigator.share({ title: card.displayName, url }).catch(() => undefined);
      return;
    }
    void navigator.clipboard?.writeText(url);
  };

  return (
    <div className="w-full">
      <div className="flex h-11 items-center justify-between border-y-[0.5px] border-[#111]">
        <p className="text-[11px] leading-none font-normal tracking-[0.12em]">
          01 <span className="px-2">/</span> CONTACT
        </p>
        <button
          type="button"
          data-card-content
          data-no-swipe
          onClick={share}
          className="flex items-center gap-2 text-[11px] leading-none font-normal tracking-[0.1em]"
        >
          SHARE
          <Share className="size-3.5" strokeWidth={1.25} aria-hidden />
        </button>
      </div>
      <div className="relative py-[22px]">
        <div className="grid grid-cols-[minmax(0,1fr)_105px] items-start gap-3 pr-9">
          <div>
            {onDisplayNameChange ? (
              <textarea
                data-card-content
                rows={2}
                value={second ? `${first}\n${second}` : first}
                onChange={(event) => onDisplayNameChange(event.target.value.replace(/\n+/g, " "))}
                onClick={(event) => event.stopPropagation()}
                className="compass-input w-full resize-none bg-transparent text-left text-[clamp(48px,13vw,58px)] leading-[0.88] font-light tracking-[-0.045em] text-[#111] outline-none"
              />
            ) : (
              <p data-card-content className="text-left text-[clamp(48px,13vw,58px)] leading-[0.88] font-light tracking-[-0.045em]">
                <span className="block">{first}</span>
                {second ? <span className="block">{second}</span> : null}
              </p>
            )}
            {positionTitle ? (
              <p data-card-content className="mt-3 text-[15px] leading-none font-light tracking-[0.1em] uppercase">
                {positionTitle}
              </p>
            ) : null}
          </div>
          {onPhotoChange ? (
            <PhotoSlotPicker photo={card.photo ?? null} onPhotoChange={onPhotoChange} sizePx={105} borderRadiusPx={0} />
          ) : card.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img data-card-content src={card.photo} alt="" className="size-[105px] object-cover" />
          ) : null}
        </div>
        {showPlus ? nextScan : null}
      </div>
    </div>
  );
}

function CompactHeader({
  card,
  positionTitle,
  positionCompany,
  onDisplayNameChange,
}: {
  card: Card;
  positionTitle?: string;
  positionCompany?: string;
  onDisplayNameChange?: (displayName: string) => void;
}) {
  return (
    <div className="flex w-full shrink-0 flex-col items-center">
      <div className="w-full text-center">
        {onDisplayNameChange ? (
          <CardNameField value={card.displayName} onChange={onDisplayNameChange} fontSizePx={CARD_HEADER_NAME_SIZE_PX} />
        ) : (
          <p data-card-content className="compass-type-name text-foreground" style={{ fontSize: CARD_HEADER_NAME_SIZE_PX }}>
            {card.displayName}
          </p>
        )}
        {positionTitle ? (
          <p data-card-content className="compass-type-position mt-1 text-center text-foreground">
            {positionTitle}
            {positionCompany ? <span className="text-label"> · {positionCompany}</span> : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}

type BusinessCardProps = {
  card: Card;
  library: ContactItem[];
  mode: MainScreenMode;
  libraryCardHeightPx?: number;
  onEmptyAreaTap: () => void;
  onPhotoChange?: (photo: string | null) => void;
  onDisplayNameChange?: (displayName: string) => void;
  onCardUpdate?: (data: Partial<Card>) => void;
  cardIndex?: number;
  cardCount?: number;
};

export const BusinessCard = forwardRef<HTMLElement, BusinessCardProps>(function BusinessCard(
  {
    card,
    library,
    mode,
    libraryCardHeightPx,
    onEmptyAreaTap,
    onPhotoChange,
    onDisplayNameChange,
    onCardUpdate,
    cardIndex = 0,
    cardCount = 1,
  },
  ref,
) {
  const setCardItemOrder = useAppStore((state) => state.setCardItemOrder);
  const shareToken = useAppStore((state) => state.user.shareToken);
  const items = getCardItems(card, library);
  const position = composeCard(items).position;
  const compact = mode === "library";
  const nextScanAddons = getNextScanAddons(card);
  const articleRef = useRef<HTMLElement | null>(null);

  const handleCommitOrder = useCallback(
    (orderedIds: string[]) => {
      setCardItemOrder(card.id, orderedIds);
    },
    [card.id, setCardItemOrder],
  );

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("[data-card-content]")) return;
    onEmptyAreaTap();
  };

  return (
    <article
      ref={(node) => {
        articleRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      onClick={handleClick}
      className={cn(
        "compass-layer flex w-full cursor-default flex-col",
        compact
          ? "compass-card compass-card-library min-h-0 items-center justify-start px-5 pb-3 transition-[transform,box-shadow,height] duration-[460ms] ease-out"
          : "relative min-h-0 overflow-x-hidden overflow-y-auto bg-white px-[clamp(24px,6.1vw,28px)] pb-6 text-[#111]",
      )}
      style={
        compact
          ? {
              height: libraryCardHeightPx,
              paddingTop: 16,
            }
          : {
              height: browseCardHeight(),
            }
      }
    >
      {compact ? (
        <CompactHeader
          card={card}
          positionTitle={position?.title}
          positionCompany={position?.company}
          onDisplayNameChange={onDisplayNameChange}
        />
      ) : (
        <EditorialHeader
          card={card}
          positionTitle={position?.title}
          shareToken={shareToken}
          showPlus={Boolean(onCardUpdate && card.displayName.trim() && card.photo)}
          nextScan={
            onCardUpdate && card.displayName.trim() && card.photo ? (
              <NextScanMenu
                bare
                addons={nextScanAddons}
                onSetAddons={(addons) => onCardUpdate({ nextScanAddons: addons })}
              />
            ) : null
          }
          onPhotoChange={onPhotoChange}
          onDisplayNameChange={onDisplayNameChange}
        />
      )}

      <ContactItemChipList
        items={items}
        size={compact ? "compact" : "browse"}
        className={compact ? "pb-2" : undefined}
        listId={card.id}
        onReorder={compact ? handleCommitOrder : undefined}
      />

      {!compact ? (
        <footer className="mt-4 flex items-end justify-between">
          <p className="text-[9.5px] leading-[1.15] font-normal tracking-[0.08em] uppercase">
            {card.displayName || "Name"}
            <br />
            Portfolio
          </p>
          <p className="flex items-center gap-3 text-[10px] tracking-[0.1em]">
            <span aria-hidden>{cardIndex === 0 ? "● ○" : "○ ●"}</span>
            <span>
              {String(cardIndex + 1).padStart(2, "0")} / {String(Math.max(cardCount, 1)).padStart(2, "0")}
            </span>
          </p>
        </footer>
      ) : null}

    </article>
  );
});
