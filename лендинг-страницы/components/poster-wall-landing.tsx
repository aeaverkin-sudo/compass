"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { AdedWordmark } from "@/shared/components/aded-wordmark";

const CSS = `
.pw-root{position:fixed;inset:0;z-index:1;color:#141210;font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;background:#bdbab4;-webkit-font-smoothing:antialiased;}
.pw-root,.pw-root *{box-sizing:border-box;}
.pw-view{position:absolute;inset:0;overflow:hidden;touch-action:none;overscroll-behavior:none;}
.pw-concrete{position:relative;display:inline-block;width:max-content;min-width:max-content;background-color:#c9c6c0;background-image:url(/landing/concrete.png);background-size:54vw auto;background-repeat:repeat;}
.pw-concrete::before{content:"";position:absolute;inset:0;pointer-events:none;z-index:1;background-image:
  repeating-linear-gradient(90deg, transparent 0 108.6vw, rgba(0,0,0,.16) 108.6vw 108.9vw, rgba(255,255,255,.14) 108.9vw 109.4vw, transparent 109.4vw 110vw),
  repeating-linear-gradient(0deg, transparent 0 128.6vw, rgba(0,0,0,.16) 128.6vw 128.9vw, rgba(255,255,255,.14) 128.9vw 129.4vw, transparent 129.4vw 130vw);}
.pw-concrete::after{content:"";position:absolute;inset:0;pointer-events:none;z-index:1;background-image:url(/landing/noise.svg);background-size:200px 200px;opacity:.035;mix-blend-mode:overlay;}
.pw-wall{position:relative;z-index:2;display:grid;width:max-content;gap:7vw;padding:9vw 8vw 24vw;grid-template-columns:repeat(4, 84vw);grid-auto-rows:116vw;}
.pw-poster{position:relative;overflow:hidden;width:84vw;min-width:84vw;max-width:84vw;background:#eceae3;padding:6vw;display:flex;flex-direction:column;box-shadow:0 .3vw .5vw rgba(0,0,0,.22), 0 1.6vw 3.4vw -.8vw rgba(0,0,0,.34);}
.pw-grain{position:absolute;inset:0;pointer-events:none;z-index:3;background-image:url(/landing/paper.png);background-size:cover;opacity:.6;mix-blend-mode:multiply;}
.pw-sheen{position:absolute;inset:0;pointer-events:none;z-index:3;background:linear-gradient(180deg, rgba(255,255,255,.13) 0%, rgba(255,255,255,0) 26%, rgba(0,0,0,.075) 100%);}
.pw-dark{background:#15130f;color:#f0eee9;}
.pw-dark .pw-grain{mix-blend-mode:soft-light;opacity:.5;}
.pw-sky{background:#8ecae6;}
.pw-orange{background:#E8640C;color:#140d08;}
.pw-layer{position:relative;z-index:2;display:flex;flex-direction:column;height:100%;}
.pw-row{display:flex;justify-content:space-between;align-items:flex-start;}
.pw-brand{height:6.6vw;width:auto;display:block;}
.pw-brand-lg{height:19vw;}
.pw-tag{font-size:2.9vw;line-height:1.4;letter-spacing:.08em;text-transform:uppercase;text-align:right;font-weight:600;}
.pw-tag-l{text-align:left;}
.pw-fill{flex:1;min-height:0;}
.pw-huge{font-weight:800;letter-spacing:-.045em;line-height:.86;text-transform:uppercase;}
.pw-idx{font-size:13vw;font-weight:800;letter-spacing:-.04em;line-height:.8;}
.pw-h2{font-size:5vw;font-weight:700;letter-spacing:-.02em;line-height:1.05;text-transform:uppercase;margin-top:1.5vw;}
.pw-mono{font-size:2.9vw;letter-spacing:.08em;text-transform:uppercase;line-height:1.75;font-weight:600;}
.pw-body{font-size:3.9vw;line-height:1.42;}
.pw-spines{flex:1;min-height:0;display:flex;align-items:stretch;gap:1.4vw;margin:3vw 0;}
.pw-sp{flex:1;display:grid;place-items:center;background:#f3f1ea;min-width:0;}
.pw-sp span{writing-mode:vertical-rl;font-weight:800;font-size:5.2vw;letter-spacing:-.01em;}
.pw-sp-o{background:#E8640C;} .pw-sp-o span{color:#fff;}
.pw-sp-k{background:#15130f;} .pw-sp-k span{color:#fff;}
.pw-shotwrap{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;margin-top:3vw;}
.pw-shotphone{height:78vw;width:auto;border-radius:5vw;overflow:hidden;background:#0d0d0f;padding:1vw;box-shadow:0 1.6vw 3.8vw -.8vw rgba(0,0,0,.45);}
.pw-shot{height:100%;width:auto;display:block;border-radius:4.2vw;}
.pw-rooms{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:2.2vw;margin:2.4vw 0;}
.pw-room{padding:2.6vw 3.4vw;}
.pw-room-sky{background:#8ecae6;color:#111;}
.pw-room-o{background:#E8640C;color:#fff;}
.pw-room-out{border:.5vw solid #4a473f;color:#f0eee9;}
.pw-rn{font-size:4.4vw;font-weight:800;letter-spacing:-.02em;text-transform:uppercase;line-height:1;}
.pw-rf{font-size:2.6vw;letter-spacing:.04em;text-transform:uppercase;margin-top:1vw;font-weight:600;opacity:.9;}
.pw-steps{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;}
.pw-step{display:grid;grid-template-columns:16vw 1fr auto;gap:3vw;align-items:start;padding:3vw 0;border-top:.3vw solid #d8d5cd;}
.pw-n{font-size:9vw;font-weight:800;letter-spacing:-.04em;line-height:.9;}
.pw-st{font-size:3vw;font-weight:700;letter-spacing:.08em;text-transform:uppercase;}
.pw-sd{font-size:3vw;color:#4a4740;margin-top:1vw;line-height:1.35;}
.pw-ic{width:9vw;height:9vw;border:.4vw solid #141210;border-radius:50%;display:grid;place-items:center;}
.pw-ic svg{width:4.4vw;height:4.4vw;fill:none;stroke:#141210;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;}
.pw-blocks{display:flex;gap:2.5vw;margin:3vw 0;}
.pw-block{position:relative;overflow:hidden;min-height:0;}
.pw-block-g{background:#cfccc5;}
.pw-block-sky{background:#8ecae6;}
.pw-block-k{background:#2a2824;}
.pw-block-o{background:#E8640C;}
.pw-lighting{position:fixed;inset:0;z-index:30;pointer-events:none;background:
  radial-gradient(55% 42% at 50% 30%, rgba(255,246,232,.20) 0%, rgba(255,246,232,0) 60%),
  radial-gradient(135% 105% at 50% 46%, rgba(0,0,0,0) 38%, rgba(22,16,11,.34) 100%),
  linear-gradient(rgba(0,0,0,.26), rgba(0,0,0,0) 14%);}
.pw-cta{position:fixed;left:0;right:0;bottom:0;z-index:50;display:flex;justify-content:center;padding:4vw 0 calc(5vw + env(safe-area-inset-bottom));background:linear-gradient(rgba(183,180,174,0), rgba(183,180,174,.55));pointer-events:none;}
.pw-go{position:fixed;left:8vw;bottom:calc(5vw + env(safe-area-inset-bottom));z-index:51;box-sizing:border-box;pointer-events:auto;display:block;width:84vw;background:#8ecae6;color:#fff;text-align:center;padding:4.6vw;font-size:4.4vw;font-weight:800;letter-spacing:.03em;text-decoration:none;box-shadow:0 1vw 3vw -.5vw rgba(0,0,0,.3);}
`;

function Mark({ big, light }: { big?: boolean; light?: boolean }) {
  return (
    <AdedWordmark
      variant="mesh"
      color={light ? "#f3f1ea" : "#E8640C"}
      className={big ? "pw-brand pw-brand-lg" : "pw-brand"}
    />
  );
}

function Poster({ tone, children }: { tone?: "sky" | "dark" | "orange"; children: ReactNode }) {
  return (
    <article className={tone ? `pw-poster pw-${tone}` : "pw-poster"}>
      <div className="pw-grain" />
      <div className="pw-sheen" />
      <div className="pw-layer">{children}</div>
    </article>
  );
}

function Tag({ left, children, size }: { left?: boolean; children: ReactNode; size?: string }) {
  return (
    <div className={left ? "pw-tag pw-tag-l" : "pw-tag"} style={size ? { fontSize: size } : undefined}>
      {children}
    </div>
  );
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <div className="pw-ic">
      <svg viewBox="0 0 24 24" aria-hidden>
        {children}
      </svg>
    </div>
  );
}

export function PosterWallLanding() {
  const view = useRef<HTMLDivElement>(null);
  const concrete = useRef<HTMLDivElement>(null);
  const wall = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const content = concrete.current;
    const sheet = wall.current;
    const vp = view.current;
    if (!content || !sheet || !vp) return;
    const node = content;
    const sheetNode = sheet;
    const viewNode = vp;
    node.style.willChange = "transform";

    let vw = window.innerWidth;
    let vh = window.innerHeight;
    let minX = 0;
    let minY = 0;
    let sized = false;
    function measure() {
      vw = window.innerWidth;
      vh = window.innerHeight;
      const width = sheetNode.offsetWidth;
      const height = sheetNode.offsetHeight;
      if (width < 1 || height < 1) return;
      minX = Math.min(0, vw - width);
      minY = Math.min(0, vh - height);
      sized = width > vw + 1 || height > vh + 1;
    }
    measure();

    const base = 0.55;
    let tx = 0;
    let ty = 0;
    const a0 = Math.PI / 4 + (Math.random() - 0.5) * (Math.PI * 0.28);
    let vx = Math.cos(a0) * base * (Math.random() < 0.5 ? -1 : 1);
    let vy = Math.sin(a0) * base * (Math.random() < 0.5 ? -1 : 1);
    function keepDiagonal() {
      const speed = Math.hypot(vx, vy);
      if (speed < 0.001) return;
      let ux = vx / speed;
      let uy = vy / speed;
      const min = 0.42;
      if (Math.abs(ux) < min) ux = (ux < 0 ? -1 : 1) * min;
      if (Math.abs(uy) < min) uy = (uy < 0 ? -1 : 1) * min;
      const unit = Math.hypot(ux, uy);
      vx = (ux / unit) * speed;
      vy = (uy / unit) * speed;
    }

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let dvx = 0;
    let dvy = 0;

    function paint() {
      node.style.transform = `translate3d(${tx.toFixed(2)}px,${ty.toFixed(2)}px,0)`;
    }

    function onResize() {
      vw = window.innerWidth;
      vh = window.innerHeight;
      measure();
      if (tx < minX) tx = minX;
      if (ty < minY) ty = minY;
    }

    function onDown(event: PointerEvent) {
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      dvx = 0;
      dvy = 0;
      try {
        viewNode.setPointerCapture(event.pointerId);
      } catch {
        /* the pointer may already be gone */
      }
    }

    function onMove(event: PointerEvent) {
      if (!dragging) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      tx += dx;
      ty += dy;
      dvx = dx;
      dvy = dy;
      if (tx > 0) tx = 0;
      if (tx < minX) tx = minX;
      if (ty > 0) ty = 0;
      if (ty < minY) ty = minY;
      paint();
    }

    function release() {
      if (!dragging) return;
      dragging = false;
      const flung = Math.hypot(dvx, dvy);
      if (flung > 0.6) {
        vx = dvx;
        vy = dvy;
      }
      const speed = Math.hypot(vx, vy);
      const cap = 46;
      if (speed > cap) {
        vx *= cap / speed;
        vy *= cap / speed;
      }
      if (Math.hypot(vx, vy) < 0.01) {
        const angle = Math.random() * 6.283;
        vx = Math.cos(angle) * base;
        vy = Math.sin(angle) * base;
      }
    }

    function hit(axis: "x" | "y", atStart: boolean) {
      if (axis === "x") tx = atStart ? 0 : minX;
      else ty = atStart ? 0 : minY;
      const speed = Math.hypot(vx, vy);
      const away = atStart ? -1 : 1;
      if (speed > base * 1.6) {
        if (axis === "x") vx = away * Math.abs(vx || 1);
        else vy = away * Math.abs(vy || 1);
        const next = Math.hypot(vx, vy) || 1;
        vx = (vx / next) * base;
        vy = (vy / next) * base;
        return;
      }
      if (axis === "x") {
        vx = -vx;
        vy += (Math.random() - 0.5) * 0.35;
      } else {
        vy = -vy;
        vx += (Math.random() - 0.5) * 0.35;
      }
    }

    let frameId = 0;
    function frame() {
      if (!sized) measure();
      if (!dragging) {
        const turn = (Math.random() - 0.5) * 0.045;
        const c = Math.cos(turn);
        const s = Math.sin(turn);
        const nx = vx * c - vy * s;
        const ny = vx * s + vy * c;
        vx = nx;
        vy = ny;
        const speed = Math.hypot(vx, vy);
        if (speed > base) {
          const k = Math.max(base, speed * 0.965) / speed;
          vx *= k;
          vy *= k;
        } else if (speed < 0.01) {
          const angle = Math.random() * 6.283;
          vx = Math.cos(angle) * base;
          vy = Math.sin(angle) * base;
        } else {
          const k = base / speed;
          vx *= k;
          vy *= k;
        }
        if (Math.hypot(vx, vy) <= base * 1.6) keepDiagonal();
        tx += vx;
        ty += vy;
        if (tx > 0) hit("x", true);
        else if (tx < minX) hit("x", false);
        if (ty > 0) hit("y", true);
        else if (ty < minY) hit("y", false);
        paint();
      }
      frameId = window.requestAnimationFrame(frame);
    }

    window.addEventListener("resize", onResize);
    viewNode.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    frameId = window.requestAnimationFrame(frame);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", onResize);
      viewNode.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
  }, []);

  return (
    <div className="pw-root">
      <style>{CSS}</style>
      <div ref={view} className="pw-view">
        <div className="pw-concrete" ref={concrete}>
          <div className="pw-wall" ref={wall}>
            <Poster>
              <div className="pw-row">
                <Mark />
                <Tag>
                  Network
                  <br />
                  Portfolio
                  <br />
                  Solution
                </Tag>
              </div>
              <div className="pw-fill" style={{ display: "flex", alignItems: "center" }}>
                <div className="pw-huge" style={{ fontSize: "19vw" }}>
                  Right you for every room.
                </div>
              </div>
              <div className="pw-row">
                <Tag left>
                  One library
                  <br />
                  Infinite connections
                </Tag>
                <Tag>adedme.com</Tag>
              </div>
            </Poster>

            <Poster tone="sky">
              <div className="pw-row">
                <div className="pw-idx">01</div>
                <div className="pw-mono">
                  Work
                  <br />
                  Projects
                  <br />
                  Education
                  <br />
                  Social
                  <br />
                  Music
                  <br />
                  Interests
                  <br />
                  Files
                  <br />
                  Contact
                </div>
              </div>
              <div className="pw-h2" style={{ marginTop: 0 }}>
                Everything
                <br />
                about you
              </div>
              <div className="pw-spines">
                <div className="pw-sp">
                  <span>FOUNDER</span>
                </div>
                <div className="pw-sp pw-sp-o">
                  <span>MY PROJECTS</span>
                </div>
                <div className="pw-sp">
                  <span>INSTAGRAM</span>
                </div>
                <div className="pw-sp pw-sp-k">
                  <span>SPOTIFY</span>
                </div>
                <div className="pw-sp">
                  <span>CONTACT</span>
                </div>
              </div>
              <div className="pw-row">
                <Mark />
                <Tag>
                  Network
                  <br />
                  Portfolio
                  <br />
                  Solution
                </Tag>
              </div>
            </Poster>

            <Poster>
              <div className="pw-row">
                <div className="pw-idx">02</div>
                <div className="pw-mono">
                  Scan to see it
                  <br />
                  live → adedme.com
                </div>
              </div>
              <div className="pw-h2" style={{ marginTop: 0 }}>
                Build
                <br />
                your portfolio
              </div>
              <div className="pw-shotwrap">
                <div className="pw-shotphone">
                  <img className="pw-shot" src="/landing/card-shot.png" alt="ADED app" />
                </div>
              </div>
            </Poster>

            <Poster tone="dark">
              <div className="pw-row">
                <div className="pw-idx">03</div>
                <div className="pw-mono">
                  Investor call
                  <br />
                  Dinner
                  <br />
                  Conference
                  <br />
                  And more.
                </div>
              </div>
              <div className="pw-h2" style={{ marginTop: 0 }}>
                One library.
                <br />
                Different rooms.
              </div>
              <div className="pw-rooms">
                <div className="pw-room pw-room-sky">
                  <div className="pw-rn">Business meeting</div>
                  <div className="pw-rf">Position · Company · Deck · Contact</div>
                </div>
                <div className="pw-room pw-room-o">
                  <div className="pw-rn">Creative event</div>
                  <div className="pw-rf">Projects · Social · Music · Instagram</div>
                </div>
                <div className="pw-room pw-room-out">
                  <div className="pw-rn">Weekend ride</div>
                  <div className="pw-rf">Interests · Cycling · Places · Playlist</div>
                </div>
              </div>
              <div className="pw-row" style={{ marginTop: "auto" }}>
                <div />
                <Tag>
                  One library —
                  <br />
                  the right you
                  <br />
                  for every room
                </Tag>
              </div>
            </Poster>

            <Poster tone="orange">
              <div className="pw-huge" style={{ fontSize: "9vw" }}>
                Who
                <br />
                we are
              </div>
              <div className="pw-fill" style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <p className="pw-body" style={{ fontSize: "4vw" }}>
                  ADED is a networking portfolio for people who are more than one title. We help you bring together your
                  work, projects, education, interests, socials and everything else that makes you, you — and share the
                  right version for every room.
                </p>
                <p className="pw-body" style={{ fontSize: "4vw", marginTop: "4vw" }}>
                  A modern way to connect, built for real life.
                </p>
              </div>
              <div className="pw-row">
                <Mark light />
                <Tag>
                  More than a card
                  <br />
                  A full portfolio
                  <br />
                  One library
                  <br />
                  For every room
                </Tag>
              </div>
            </Poster>

            <Poster>
              <div className="pw-huge" style={{ fontSize: "9vw" }}>
                How
                <br />
                it works
              </div>
              <div className="pw-steps">
                <div className="pw-step">
                  <div className="pw-n">01</div>
                  <div>
                    <div className="pw-st">Add</div>
                    <div className="pw-sd">Add text, links, socials, projects, files, photos, playlists and more.</div>
                  </div>
                  <Icon>
                    <path d="M12 5v14M5 12h14" />
                  </Icon>
                </div>
                <div className="pw-step">
                  <div className="pw-n">02</div>
                  <div>
                    <div className="pw-st">Organize</div>
                    <div className="pw-sd">Everything in one clean portfolio.</div>
                  </div>
                  <Icon>
                    <path d="M12 3l8 4.5-8 4.5-8-4.5 8-4.5z" />
                    <path d="M4 12l8 4.5 8-4.5" />
                  </Icon>
                </div>
                <div className="pw-step">
                  <div className="pw-n">03</div>
                  <div>
                    <div className="pw-st">Share</div>
                    <div className="pw-sd">Share via QR, link or Apple Wallet.</div>
                  </div>
                  <Icon>
                    <path d="M12 15V4M8.5 7.5 12 4l3.5 3.5" />
                    <path d="M5 13v5a2 2 0 002 2h10a2 2 0 002-2v-5" />
                  </Icon>
                </div>
                <div className="pw-step">
                  <div className="pw-n">04</div>
                  <div>
                    <div className="pw-st">Connect</div>
                    <div className="pw-sd">Meet. Save. Stay in touch.</div>
                  </div>
                  <Icon>
                    <circle cx="8.5" cy="8" r="3" />
                    <circle cx="16.6" cy="9.5" r="2.3" />
                    <path d="M3 19c0-3 2.4-4.8 5.5-4.8S14 16 14 19M14.6 18.4c.2-1.9 1.8-3.2 4-3.2 1.4 0 2.6.5 3.3 1.3" />
                  </Icon>
                </div>
              </div>
              <div className="pw-row">
                <Mark />
                <Tag>
                  Network
                  <br />
                  Portfolio
                  <br />
                  Solution
                </Tag>
              </div>
            </Poster>

            <Poster tone="dark">
              <div className="pw-row">
                <div />
                <div className="pw-mono">
                  People
                  <br />
                  Ideas
                  <br />
                  Projects
                  <br />
                  Places
                  <br />
                  Culture
                </div>
              </div>
              <div className="pw-fill pw-blocks">
                <div className="pw-block pw-block-g" style={{ flex: 1.3 }} />
                <div style={{ flex: 0.7, display: "flex", flexDirection: "column", gap: "2.5vw" }}>
                  <div className="pw-block pw-block-sky" style={{ flex: 1 }} />
                  <div className="pw-block pw-block-k" style={{ flex: 1 }} />
                </div>
              </div>
              <div className="pw-huge" style={{ fontSize: "13vw" }}>
                A bigger
                <br />
                you.
              </div>
              <div className="pw-row" style={{ marginTop: "2vw" }}>
                <Mark light />
                <Tag size="2.6vw">
                  Work · Life
                  <br />
                  Interests &
                  <br />
                  everything
                  <br />
                  in between
                </Tag>
              </div>
            </Poster>

            <Poster>
              <div className="pw-row" style={{ justifyContent: "flex-end" }}>
                <Tag>
                  Network
                  <br />
                  Portfolio
                  <br />
                  Solution
                </Tag>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-start", margin: "4vw 0 2vw" }}>
                <Mark big />
              </div>
              <div className="pw-fill" style={{ display: "flex", gap: "3vw", margin: "3vw 0", alignItems: "stretch" }}>
                <div className="pw-block pw-block-o" style={{ flex: 1.4 }} />
                <div style={{ flex: 0.6, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <div className="pw-h2" style={{ fontSize: "6vw", margin: 0 }}>
                    Meet
                    <br />
                    Share
                    <br />
                    Connect
                  </div>
                </div>
              </div>
              <div className="pw-row">
                <Tag left size="3.4vw">
                  Right you
                  <br />
                  for every room.
                </Tag>
                <Tag>adedme.com</Tag>
              </div>
            </Poster>
          </div>
        </div>
      </div>
      <div className="pw-lighting" />
      <div className="pw-cta">
        <Link href="/create" className="pw-go">
          GET YOUR PORTFOLIO
        </Link>
      </div>
    </div>
  );
}
