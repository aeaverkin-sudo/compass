"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { PhotoSlotPicker } from "@landing/components/photo-slot-picker";
import { carouselSidePaddingPx, SCREEN_TOP_AXIS_PX } from "@main/layout";
import { BackButton } from "@/shared/components/back-button";
import { TapButton } from "@/shared/components/tap-button";
import { VALUE_AXIS_PX } from "@/shared/layout/axes";
import { markRegisteredDevice } from "@/shared/lib/registered-device";
import { clearRegistrationRequired, ignoreNextSignedOut } from "@/shared/lib/session-bootstrap";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { uploadAttachment } from "@/shared/services/attachment-upload";
import { scheduleItemUpsert } from "@/shared/services/card-items-sync";
import { assignHandle } from "@/shared/services/card-handle";
import { ensureCardIdentity, hydrateCardsFromServer } from "@/shared/services/card-sync";
import type { Card } from "@/shared/types";
import { useAppStore } from "@/shared/store/app-store";
import { useUploadStatus } from "@/shared/store/upload-status";
import { useKeyboardLift } from "@/shared/hooks/use-keyboard-lift";
import { EntryName } from "./entry-name";
import { EntryZones, type EntryZonesHandle } from "./entry-zones";

const PAD = "px-[calc(clamp(24px,6.1vw,28px)-3mm)]";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PASSWORD_MIN = 8;

function emailOk(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export type EntryInput = {
  name?: string;
  email?: string;
  event?: { lookup: string; guestToken?: string };
  sourceToken?: string;
  next?: string;
};

let issuedPassword = "";

function makePassword() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let raw = "";
  for (const byte of bytes) raw += ALPHABET[byte % ALPHABET.length] ?? "A";
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

function passwordNow() {
  if (!issuedPassword) issuedPassword = makePassword();
  return issuedPassword;
}

/** An existing account signs in and finishes the door there. The questionnaire is not shown again. */
function signInHref(email: string | undefined, input: EntryInput) {
  const query = new URLSearchParams();
  query.set("signin", "1");
  if (email) query.set("email", email);
  if (input.event) {
    const next = input.event.guestToken
      ? `/e/${encodeURIComponent(input.event.lookup)}?g=${encodeURIComponent(input.event.guestToken)}&go=1`
      : `/e/${encodeURIComponent(input.event.lookup)}`;
    query.set("next", next);
  } else if (input.sourceToken) {
    query.set("next", `/save/${input.sourceToken}`);
  }
  return `/register?${query.toString()}`;
}

export function EntryPage({ input }: { input: EntryInput }) {
  const router = useRouter();
  const offeredName = input.name?.trim() ?? "";
  const offeredEmail = input.email?.trim().toLowerCase() ?? "";
  const [name, setName] = useState(offeredName);
  const [nameLive, setNameLive] = useState(!offeredName);
  const [email, setEmail] = useState(offeredEmail);
  const [emailLive, setEmailLive] = useState(!offeredEmail);
  const [passwordVisible, setPasswordVisible] = useState(true);
  const [photo, setPhoto] = useState<{ file: File; dataUrl: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taken, setTaken] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const zonesRef = useRef<EntryZonesHandle>(null);
  const [sidePad, setSidePad] = useState(() => carouselSidePaddingPx(0, true));
  const [passwordValue, setPasswordValue] = useState<string | null>(null);
  const passwordShown = passwordValue ?? "";
  const ready = Boolean(name.trim() && emailOk(email) && passwordShown.length >= PASSWORD_MIN);
  const frame = { paddingLeft: sidePad, paddingRight: sidePad };

  useEffect(() => {
    setPasswordValue((current) => current ?? passwordNow());
  }, []);

  useEffect(() => {
    const measure = () => setSidePad(carouselSidePaddingPx(window.innerWidth, true));
    measure();
    window.addEventListener("orientationchange", measure);
    return () => window.removeEventListener("orientationchange", measure);
  }, []);

  useKeyboardLift(mainRef);

  const submit = async () => {
    if (busy || !ready) return;
    const zones = zonesRef.current?.snapshot() ?? [];
    const emailValue = email.trim().toLowerCase();
    const titleValue = name.trim();
    const secret = passwordShown;
    setBusy(true);
    setError(null);
    setTaken(false);
    let created = false;
    try {
      const response = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify({
          email: emailValue,
          password: secret,
          ...(input.sourceToken ? { sourceToken: input.sourceToken } : {}),
          ...(input.event
            ? { event: { lookup: input.event.lookup, ...(input.event.guestToken ? { guestToken: input.event.guestToken } : {}) } }
            : {}),
          card: {
            displayName: titleValue,
            rubricOrder: zones.map((zone) => zone.id),
            rubricLabels: Object.fromEntries(zones.flatMap((zone) => (zone.title.trim() ? [[zone.id, zone.title.trim()]] : []))),
            ...(zonesRef.current?.headerKey() ? { headerKey: zonesRef.current.headerKey() } : {}),
            zones: zones.map((zone) => ({
              id: zone.id,
              title: zone.title.trim(),
              rows: zone.rows
                .filter((row) => row.value.trim())
                .map((row) => ({ key: row.key, value: row.value.trim(), ...(row.type ? { type: row.type } : {}) })),
            })),
          },
        }),
      });
      const reply = (await response.json().catch(() => ({}))) as {
        cardId?: string;
        publicToken?: string;
        kind?: string;
        error?: string;
        fileItems?: { key: string; itemId: string }[];
        itemIds?: string[];
        itemZones?: Record<string, string>;
        headerItemId?: string;
        title?: string;
        saved?: boolean;
        savedName?: string;
        joined?: boolean;
        pay?: boolean;
        eventLookup?: string;
        warning?: string;
      };
      if (response.status === 409 || reply.kind === "login") {
        setTaken(true);
        setError("This email already has an account.");
        setBusy(false);
        return;
      }
      if (!response.ok || !reply.cardId) {
        setError("Could not create your profile.");
        setBusy(false);
        return;
      }
      const cardId = reply.cardId;
      created = true;
      (document.activeElement as HTMLElement | null)?.blur();
      const supabase = createBrowserSupabaseClient();
      const signed = await Promise.race([
        (async () => {
          ignoreNextSignedOut();
          await supabase.auth.signOut({ scope: "local" });
          return supabase.auth.signInWithPassword({ email: emailValue, password: secret });
        })(),
        new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new Error("sign-in")), 20000);
        }),
      ]);
      if (signed.error || !signed.data.session) {
        setError("Account created, but sign-in failed — tap Sign in.");
        setTaken(true);
        setBusy(false);
        return;
      }
      const now = new Date().toISOString();
      const portfolio: Card = assignHandle(
        ensureCardIdentity({
          id: cardId,
          displayName: titleValue,
          photo: photo?.dataUrl,
          photoLook: photo ? "shadow" : undefined,
          title: reply.title?.trim() ?? "",
          ...(reply.headerItemId ? { headerItemId: reply.headerItemId } : {}),
          status: "published",
          publicToken: reply.publicToken ?? "",
          qrVersion: 1,
          contactItemIds: reply.itemIds ?? [],
          rubricOrder: zones.map((zone) => zone.id),
          rubricLabels: Object.fromEntries(zones.flatMap((zone) => (zone.title.trim() ? [[zone.id, zone.title.trim()]] : []))),
          itemZones: reply.itemZones,
          listed: true,
          nextScanAddons: [],
          createdAt: now,
          updatedAt: now,
        }),
        [],
        true,
      );
      useAppStore.getState().resetApp();
      markRegisteredDevice();
      clearRegistrationRequired();
      useAppStore.setState({
        user: { ...useAppStore.getState().user, onboarded: true },
        cards: [portfolio],
        currentCardIndex: 0,
        contactItems: [],
      });
      const rows = zones.flatMap((zone) => zone.rows);
      const files = (reply.fileItems ?? []).flatMap((item) => {
        const row = rows.find((entry) => entry.key === item.key);
        return row?.file && row.type ? [{ itemId: item.itemId, file: row.file, type: row.type }] : [];
      });
      for (const item of files) {
        useUploadStatus.getState().setStatus(item.itemId, { state: "uploading", percent: null });
      }
      if (reply.joined && reply.eventLookup && input.event?.guestToken) {
        const screen = reply.pay ? "pay" : "join";
        router.replace(`/e/${encodeURIComponent(reply.eventLookup)}/${screen}`);
      } else if (input.sourceToken && reply.saved && !reply.warning) {
        const added = reply.savedName?.trim() || "Untitled";
        router.replace(`/network?added=${encodeURIComponent(added)}&from=${encodeURIComponent(input.sourceToken)}`);
      } else {
        router.replace("/main");
      }
      void (async () => {
        const synced = hydrateCardsFromServer();
        if (photo) {
          try {
            const readyPhoto = await uploadAttachment({ file: photo.file, kind: "card-photo", cardId });
            useAppStore.getState().updateCard(cardId, { photoAttachmentId: readyPhoto.attachmentId, photoLook: "shadow" });
          } catch {
            // The portfolio is already open. The photo can be added again in Edit.
          }
        }
        await synced;
        for (const item of files) {
          try {
            const readyFile = await uploadAttachment({ file: item.file, kind: item.type, cardId });
            const current = useAppStore.getState().contactItems.find((entry) => entry.id === item.itemId);
            if (current) {
              const next = { ...current, attachmentId: readyFile.attachmentId, url: "" };
              useAppStore.setState({
                contactItems: useAppStore.getState().contactItems.map((entry) => (entry.id === item.itemId ? next : entry)),
              });
              scheduleItemUpsert(next);
            }
            useUploadStatus.getState().setStatus(item.itemId, null);
          } catch (error) {
            const reason = error instanceof Error && error.message ? error.message : "Upload failed";
            useUploadStatus.getState().fail(item.itemId, reason);
          }
        }
      })();
    } catch {
      if (created) {
        setError("Account created, but sign-in failed — tap Sign in.");
        setTaken(true);
      } else {
        setError("Could not create your profile.");
      }
      setBusy(false);
    }
  };

  return (
    <main
      ref={mainRef}
      className="compass-main h-[100svh] overflow-y-auto overscroll-contain bg-background text-[var(--ink)]"
    >
      <BackButton fallbackHref="/" />
      <div style={{ height: `calc(env(safe-area-inset-top) + ${SCREEN_TOP_AXIS_PX}px - 11px + 22px + 18px)` }} />
      <div style={frame}>
      <div className={PAD}>
        <div className="flex items-stretch gap-3" style={{ height: 128 }}>
          <div className="relative shrink-0">
            <PhotoSlotPicker
              photo={photo?.dataUrl ?? null}
              onPhotoChange={(dataUrl, file) => setPhoto(dataUrl && file ? { file, dataUrl } : null)}
              sizePx={128}
              borderRadiusPx={0}
              photoLook="shadow"
              surfaceClassName="bg-white"
              className={photo ? undefined : "[&_button_svg]:invisible"}
            />
            {photo ? null : (
              <span className="t-label pointer-events-none absolute inset-0 flex items-center justify-center px-1 text-center leading-[1.15] text-[var(--grey)]">
                Add
                <br />
                photo
              </span>
            )}
          </div>
          <EntryName
            value={name}
            live={nameLive}
            onChange={(next) => {
              setNameLive(true);
              setName(next);
            }}
            onTouch={() => setNameLive(true)}
          />
        </div>
        <EntryZones ref={zonesRef} />
      </div>
      </div>
      <div className="bg-sky py-[18px]">
        <div style={frame}>
        <div className={`${PAD} flex flex-col gap-[14px]`}>
          <label className="grid grid-cols-[86px_minmax(0,1fr)] items-center gap-x-[14px] border-b border-[var(--ink)]">
            <span className="t-label">
              Email
              <span className="relative -top-[0.35em] ml-[0.15em] leading-none text-[var(--ink)]">*</span>
            </span>
            <input
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoComplete="off"
              aria-label="Email"
              placeholder="name@mail.com"
              value={email}
              onFocus={() => setEmailLive(true)}
              onChange={(event) => {
                setEmailLive(true);
                setEmail(event.target.value);
              }}
              className={`t-body m-0 w-full border-0 bg-transparent p-0 outline-none placeholder:text-[var(--placeholder)] ${emailLive ? "text-[var(--ink)]" : "text-[var(--placeholder)]"}`}
            />
          </label>
          <label className="grid grid-cols-[86px_minmax(0,1fr)] items-center gap-x-[14px] border-b border-[var(--ink)]">
            <span className="t-label">Password</span>
            <span className="flex min-w-0 items-center gap-2">
              <input
                type={passwordVisible ? "text" : "password"}
                autoComplete="off"
                aria-label="Password"
                value={passwordShown}
                onChange={(event) => setPasswordValue(event.target.value)}
                className="t-body m-0 w-full min-w-0 border-0 bg-transparent p-0 text-[var(--ink)] outline-none"
              />
              <button
                type="button"
                aria-label={passwordVisible ? "Hide password" : "Show password"}
                className="shrink-0 border-0 bg-transparent p-0 text-[var(--ink)]"
                onClick={() => setPasswordVisible((current) => !current)}
              >
                {passwordVisible ? <Eye className="size-4" strokeWidth={1.5} /> : <EyeOff className="size-4" strokeWidth={1.5} />}
              </button>
            </span>
          </label>
          {passwordShown.length > 0 && passwordShown.length < PASSWORD_MIN ? (
            <p className="m-0 t-meta text-[var(--ink)]" style={{ marginLeft: VALUE_AXIS_PX }}>
              At least 8 characters.
            </p>
          ) : null}
          <p className="m-0 t-meta text-[var(--ink)]" style={{ marginLeft: VALUE_AXIS_PX }}>
            You can change it anytime in Profile.
          </p>
        </div>
        </div>
      </div>
      <div style={frame}>
      <div className={`${PAD} flex flex-col gap-4 pt-[18px] pb-[max(24px,env(safe-area-inset-bottom))]`}>
        {error ? <p className="m-0 t-meta text-[var(--ink)]" style={{ marginLeft: VALUE_AXIS_PX }}>{error}</p> : null}
        {taken ? (
          <a
            href={signInHref(email.trim().toLowerCase(), input)}
            className="t-meta text-[var(--ink)] underline"
            style={{ marginLeft: VALUE_AXIS_PX }}
          >
            Sign in
          </a>
        ) : null}
        <div className="grid grid-cols-[86px_minmax(0,1fr)] gap-x-[14px]">
          <span />
          <TapButton
            onTap={() => void submit()}
            disabled={!ready || busy}
            className="w-full bg-sky px-[21.6px] py-[10.8px] text-center t-band leading-[calc(13px*1.45)] text-[var(--ink)] disabled:text-[var(--grey)]"
          >
            {busy ? "Creating…" : "Create portfolio"}
          </TapButton>
        </div>
        <p className="m-0 t-meta text-[var(--grey)]" style={{ marginLeft: VALUE_AXIS_PX }}>
          Already have an account?{" "}
          <a href={signInHref(undefined, input)} className="underline">
            Sign in
          </a>
        </p>
      </div>
      </div>
    </main>
  );
}
