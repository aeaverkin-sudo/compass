"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Plus, Scan, Share } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils";

const ORANGE = "#E8640C";
const LOGO = "/brand/aded-grid-orange-1024.png";
const LOCATION = "Based in Lisbon";
const WEB = "adedme.com";
const ABOUT =
  "ADED ME is your portfolio to share. Share the right you. Put everything in one library — contacts, links, work, decks, files, socials. Assemble a portfolio for each room: professional, personal, your company, your project.";
const CONTACT = "support@adedme.com";

const BAND = 300;
const PHOTO = 700;
const TITLE = 1000;
const CTRL = 1080;
const QR = 1500;
const CTRL_UP = 1680;
const ZONE_1 = 2200;
const TYPE_1 = 2360;
const ZONE_2 = 3100;
const TYPE_2 = 3260;
const ZONE_3 = 3900;
const ABOUT_INK = 4200;
const ZONE_4 = 4700;
const PLUS_PRESS = 5250;
const PLUS_GONE = 5720;
const CTA = 6300;
const REPLAY = 13300;
const TYPE_STEP_MS = 55;

const STEPS = [
  BAND, PHOTO, TITLE, CTRL, QR, CTRL_UP, ZONE_1, TYPE_1, ZONE_2, TYPE_2,
  ZONE_3, ABOUT_INK, ZONE_4, PLUS_PRESS, PLUS_GONE, CTA,
];

const SKY = "bg-[#c5e8f7]";
const MONO = "font-['Courier_New',monospace]";
const CAPS = "text-[13px] tracking-[.14em] uppercase text-[#1f3c45]";

function fade(on: boolean) {
  return cn("[transition:opacity_.45s,translate_.45s]", on ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0");
}

function Typed({ text, started, count }: { text: string; started: boolean; count: number }) {
  return (
    <>
      {text.slice(0, count)}
      {started && count < text.length ? (
        <span
          className="ml-px inline-block h-[1em] w-[2px] align-[-2px] animate-[landing-caret_.7s_steps(1)_infinite]"
          style={{ background: ORANGE }}
        />
      ) : null}
    </>
  );
}

function Zone({
  number,
  label,
  on,
  children,
  valueClass,
}: {
  number: string;
  label: string;
  on: boolean;
  children: ReactNode;
  valueClass?: string;
}) {
  return (
    <div className={cn("grid grid-cols-[86px_1fr] items-start gap-x-[14px] px-10 py-[13px]", fade(on))}>
      <div>
        <span className="text-[32px] leading-none font-normal tracking-[-.03em] text-[#111] tabular-nums">{number}</span>
        <div className="mt-[6px] text-[11px] leading-[1.45] tracking-[.1em] text-[#999] uppercase">{label}</div>
      </div>
      <div
        className={cn(
          "min-h-[22px] pt-[5px] text-[15.5px] leading-[1.45] tracking-[-.015em] text-[#111] [transition:color_.55s,opacity_.4s]",
          valueClass,
        )}
      >
        {children}
      </div>
    </div>
  );
}

function ZoneRule({ on }: { on: boolean }) {
  return <div className={cn("mx-10 h-px bg-[#999] transition-opacity duration-[350ms]", on ? "opacity-100" : "opacity-0")} />;
}

export function LiveCardLanding() {
  const [cycle, setCycle] = useState(0);
  const [at, setAt] = useState(-1);
  const [typed1, setTyped1] = useState(0);
  const [typed2, setTyped2] = useState(0);

  useEffect(() => {
    const timers: number[] = [];
    const typers: number[] = [];
    for (const ms of STEPS) timers.push(window.setTimeout(() => setAt(ms), ms));
    const type = (ms: number, text: string, set: (count: number) => void) => {
      timers.push(
        window.setTimeout(() => {
          let count = 0;
          const typer = window.setInterval(() => {
            count += 1;
            set(count);
            if (count >= text.length) window.clearInterval(typer);
          }, TYPE_STEP_MS);
          typers.push(typer);
        }, ms),
      );
    };
    type(TYPE_1, LOCATION, setTyped1);
    type(TYPE_2, WEB, setTyped2);
    timers.push(
      window.setTimeout(() => {
        setAt(-1);
        setTyped1(0);
        setTyped2(0);
        setCycle((value) => value + 1);
      }, REPLAY),
    );
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      typers.forEach((typer) => window.clearInterval(typer));
    };
  }, [cycle]);

  const shown = (ms: number) => at >= ms;

  return (
    <div
      className={cn(
        "flex min-h-svh flex-col overflow-x-hidden bg-white text-[#111] antialiased",
        "bg-[linear-gradient(rgba(232,100,12,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(232,100,12,.12)_1px,transparent_1px)] bg-[size:44px_44px]",
        "font-['Helvetica_Neue',Helvetica,Arial,sans-serif]",
      )}
    >
      <nav className="flex items-center justify-between px-[26px] py-[22px]">
        <Image src={LOGO} alt="aded" width={70} height={22} priority className="h-[22px] w-auto" />
        <span className={cn("text-[12px] tracking-[.14em] uppercase", MONO)} style={{ color: ORANGE }}>
          adedme.com
        </span>
      </nav>

      <div className="flex flex-1 flex-col items-center justify-center gap-[22px] px-[18px] pt-1 pb-[54px] text-center">
        <div>
          <div className={cn("mb-3 text-[12px] tracking-[.24em] uppercase", MONO)} style={{ color: ORANGE }}>
            Network solution
          </div>
          <h1 className="text-[clamp(32px,6.2vw,54px)] leading-[.98] font-bold tracking-[-.03em]">
            The network you
            <br />
            actually met.
          </h1>
          <p className="mx-auto mt-[14px] max-w-[430px] text-[16px] leading-[1.5] text-[#555]">
            Build your portfolio card in seconds. Share it with a tap. Keep everyone you meet.
          </p>
        </div>

        <div className="relative w-[390px] max-[430px]:origin-top max-[430px]:scale-[.88]">
          <div
            className={cn(
              "relative min-h-[827px] w-[390px] overflow-hidden rounded-[22px] bg-white pb-12 text-left",
              "shadow-[0_26px_64px_rgba(0,0,0,.13),0_2px_8px_rgba(0,0,0,.05)]",
            )}
          >
            <div className={cn("relative h-[184px] pt-[26px] text-center", fade(shown(QR)))}>
              <a
                href="https://adedme.com"
                target="_blank"
                rel="noreferrer"
                className={cn("inline-block", shown(QR) && "animate-[landing-qr-blink_.5s_1]")}
              >
                <QRCodeSVG value="https://adedme.com" size={136} level="M" marginSize={0} fgColor={ORANGE} bgColor="transparent" />
              </a>
            </div>

            <div
              className={cn(
                "absolute top-[26px] right-0 flex h-[136px] w-[46px] flex-col items-center justify-between py-4 text-[#1f3c45]",
                "[transition:opacity_.4s,translate_.62s_cubic-bezier(.2,.85,.2,1)]",
                SKY,
                shown(CTRL) ? "opacity-100" : "opacity-0",
                shown(CTRL_UP) ? "translate-y-0" : "translate-y-[170px]",
              )}
            >
              <Share className="size-[18px]" strokeWidth={1.7} aria-hidden />
              <Scan className="size-[18px]" strokeWidth={1.7} aria-hidden />
              <Plus className="size-[18px]" strokeWidth={1.7} aria-hidden />
              <span className="text-[11px] font-semibold tracking-[.01em] text-[#111]">2/5</span>
            </div>

            <div
              className={cn(
                "absolute top-[196px] left-10 flex size-[112px] items-center justify-center bg-white shadow-[0_5px_16px_rgba(0,0,0,.09)]",
                fade(shown(PHOTO)),
              )}
            >
              <Image src={LOGO} alt="aded" width={92} height={29} className="w-[92px]" />
            </div>
            <div
              className={cn(
                "absolute top-[202px] left-[168px] text-[54px] leading-[.95] font-bold tracking-[-.035em]",
                fade(shown(TITLE)),
              )}
            >
              ADED
              <br />
              Me.
            </div>

            <div className="absolute inset-x-0 top-[314px]">
              <Zone number="01" label="Location" on={shown(ZONE_1)}>
                <Typed text={LOCATION} started={shown(TYPE_1)} count={typed1} />
              </Zone>
              <ZoneRule on={shown(ZONE_2)} />
              <Zone number="02" label="Web" on={shown(ZONE_2)}>
                <Typed text={WEB} started={shown(TYPE_2)} count={typed2} />
              </Zone>
              <ZoneRule on={shown(ZONE_3)} />
              <Zone number="03" label="About" on={shown(ZONE_3)} valueClass={shown(ABOUT_INK) ? undefined : "text-[#cacaca]"}>
                {ABOUT}
              </Zone>
              <ZoneRule on={shown(ZONE_4)} />
              <Zone
                number="04"
                label="Contact"
                on={shown(ZONE_4)}
                valueClass={cn(
                  "flex items-center justify-between gap-3",
                  !shown(PLUS_GONE) && "text-[#c4c4c4] opacity-[.72]",
                )}
              >
                <span>{CONTACT}</span>
                <span
                  aria-hidden
                  className={cn(
                    "flex-none px-1 text-[28px] leading-none font-normal text-[#b3b3b3]",
                    "[transition:scale_.16s_ease,opacity_.3s,color_.18s]",
                    shown(PLUS_PRESS) && "scale-[.68] text-[#7d7d7d]",
                    shown(PLUS_GONE) && "scale-[.4] opacity-0",
                  )}
                >
                  +
                </span>
              </Zone>
            </div>

            <div
              className={cn(
                "absolute inset-x-0 bottom-0 flex h-12 items-center justify-between px-10",
                "[transition:translate_.5s_cubic-bezier(.2,.8,.2,1)]",
                SKY,
                shown(BAND) ? "translate-y-0" : "translate-y-full",
              )}
            >
              <span className={CAPS}>Profile</span>
              <span className={CAPS}>Edit</span>
              <span className={CAPS}>Network</span>
            </div>
          </div>

          <Link
            href="/register"
            className={cn(
              "absolute top-[312px] right-[-24px] z-[6] block rounded-[7px] px-8 py-6 text-left whitespace-nowrap text-[#111] max-[430px]:right-[-10px]",
              "shadow-[0_22px_48px_rgba(0,0,0,.26),0_3px_10px_rgba(0,0,0,.12)]",
              "[transition:opacity_.6s,translate_.6s_cubic-bezier(.2,.85,.2,1),scale_.6s_cubic-bezier(.2,.85,.2,1)]",
              SKY,
              shown(CTA) ? "translate-x-0 scale-100 opacity-100" : "pointer-events-none translate-x-[44px] scale-[.94] opacity-0",
            )}
          >
            <b className="block text-[27px] leading-none font-bold tracking-[-.02em]">Get yours now</b>
            <small className={cn("mt-[7px] block text-[12px] tracking-[.1em] text-[#1f3c45] uppercase", MONO)}>
              Join your network →
            </small>
          </Link>
        </div>
      </div>
    </div>
  );
}
