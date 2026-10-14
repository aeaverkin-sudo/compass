import type { ReactElement } from "react";
import type { TeamRoleName } from "@/shared/event/permissions";
import { eventThemeById, modernAccent, type EventLayoutId, type EventThemeId } from "@/shared/event/themes";

const MODERN_PAPER = "#f6f5f0";
/** 286:404 at the card's height. Satori has no object-fit, so the size is the poster's own. */
const POSTER_W = 446;
const POSTER_H = 630;
const POSTER_SLOT = 448;

export type OgPoster = {
  name: string;
  meta: string | null;
  themeId: EventThemeId;
  layout: EventLayoutId;
  /** The rendered invite cover as a data URL; null before its first snapshot. */
  poster: string | null;
  team: boolean;
  role: TeamRoleName | null;
};

function nameSize(name: string, wide: boolean): number {
  if (name.length > 60) return 44;
  if (name.length > 36) return 56;
  if (name.length > 18) return wide ? 76 : 64;
  return wide ? 96 : 80;
}

/** Link preview: the event's own poster, then a panel in its colours. Flex only, so Satori can paint it. */
export function ogPosterElement(card: OgPoster): ReactElement {
  const theme = eventThemeById(card.themeId);
  const modern = card.layout === "oversized";
  const ground = modern ? MODERN_PAPER : theme.ground;
  const ink = modern ? "#111111" : theme.ink;
  const title = modern ? modernAccent(card.themeId) : ink;
  const ribbon = card.team ? (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        background: ink,
        color: ground,
        padding: "14px 28px",
        fontSize: 20,
        letterSpacing: 4,
        fontWeight: 700,
      }}
    >
      <div>TEAM INVITE</div>
      {card.role ? <div style={{ letterSpacing: 2 }}>{card.role.toUpperCase()}</div> : null}
    </div>
  ) : null;

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", background: ground, color: ink, fontFamily: "Arimo" }}>
      {card.poster ? (
        <div style={{ display: "flex", position: "relative", width: POSTER_SLOT, height: POSTER_H, background: ground }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={card.poster} alt="" width={POSTER_W} height={POSTER_H} />
          {ribbon ? <div style={{ display: "flex", flexDirection: "column", position: "absolute", top: 0, left: 0, width: POSTER_W }}>{ribbon}</div> : null}
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        {card.poster ? null : ribbon}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, padding: 70 }}>
          <div style={{ display: "flex", justifyContent: "flex-end", fontSize: 20, letterSpacing: 7, fontWeight: 700, opacity: 0.6 }}>
            ADED
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                color: title,
                fontSize: nameSize(card.name, !card.poster),
                fontWeight: 700,
                lineHeight: 1.05,
                letterSpacing: -1,
              }}
            >
              {card.name}
            </div>
            {card.meta ? <div style={{ marginTop: 22, fontSize: 30, lineHeight: 1.35, opacity: 0.72 }}>{card.meta}</div> : null}
          </div>
          <div style={{ display: "flex", fontSize: 18, letterSpacing: 4, opacity: 0.6 }}>adedme.com</div>
        </div>
      </div>
    </div>
  );
}
