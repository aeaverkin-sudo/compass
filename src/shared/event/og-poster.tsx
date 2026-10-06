import type { ReactElement } from "react";
import type { TeamRoleName } from "@/shared/event/permissions";
import { eventThemeById, type EventLayoutId, type EventThemeId } from "@/shared/event/themes";

const MODERN_PAPER = "#f6f5f0";

export type OgPoster = {
  name: string;
  meta: string | null;
  themeId: EventThemeId;
  layout: EventLayoutId;
  photo: string | null;
  team: boolean;
  role: TeamRoleName | null;
};

function nameSize(name: string): number {
  if (name.length > 60) return 44;
  if (name.length > 36) return 56;
  if (name.length > 18) return 68;
  return 84;
}

/** Brand preview for a link. Flex only, so Satori can paint it. */
export function ogPosterElement(poster: OgPoster): ReactElement {
  const theme = eventThemeById(poster.themeId);
  const modern = poster.layout === "oversized";
  const ground = modern ? MODERN_PAPER : theme.ground;
  const ink = modern ? "#111111" : theme.ink;
  const photoHeight = poster.team ? 574 : 630;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: ground,
        color: ink,
        fontFamily: "Arimo",
      }}
    >
      {poster.team ? (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: ink,
            color: ground,
            padding: "16px 40px",
            fontSize: 22,
            letterSpacing: 4,
            fontWeight: 700,
          }}
        >
          <div>TEAM INVITE</div>
          {poster.role ? <div style={{ letterSpacing: 2 }}>{poster.role.toUpperCase()}</div> : null}
        </div>
      ) : null}
      <div style={{ display: "flex", flex: 1 }}>
        {poster.photo ? (
          // Satori paints a plain img. The poster masks stay on the live cover.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={poster.photo} alt="" width={460} height={photoHeight} style={{ objectFit: "cover" }} />
        ) : modern ? (
          <div style={{ width: 18, background: theme.ground }} />
        ) : null}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            flex: 1,
            padding: "48px 52px 40px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: nameSize(poster.name),
                fontWeight: 700,
                lineHeight: 1.05,
                letterSpacing: -1,
              }}
            >
              {poster.name}
            </div>
            {poster.meta ? <div style={{ marginTop: 22, fontSize: 30, lineHeight: 1.35 }}>{poster.meta}</div> : null}
          </div>
          <div style={{ fontSize: 20, letterSpacing: 6, fontWeight: 700 }}>ADED</div>
        </div>
      </div>
    </div>
  );
}
