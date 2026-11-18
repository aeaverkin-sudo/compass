"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Eye, EyeOff } from "lucide-react";
import { PhotoSlotPicker } from "@landing/components/photo-slot-picker";
import { BottomNav } from "@main/components/bottom-nav";
import { carouselSidePaddingPx } from "@main/layout";
import { AuthModeToggle } from "@/shared/components/auth-mode-toggle";
import { BackButton } from "@/shared/components/back-button";
import { SectionNumber } from "@/shared/components/section-number";
import { ROW_LINE_TRIM, SOCIAL_SIGNIN, SocialSignInRows } from "@/shared/components/social-sign-in-rows";
import { TapButton } from "@/shared/components/tap-button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { VALUE_AXIS_PX } from "@/shared/layout/axes";
import { clearFillPlace, photoFileFromDraft, readQuestionnaire, readQuestionnairePhoto, writeQuestionnaire, writeQuestionnairePhoto, type QuestionnairePlace } from "@/shared/lib/fill-place";
import { track } from "@/shared/lib/funnel";
import { markNewContact } from "@/shared/lib/new-contact";
import { rememberOpenProfile } from "@/shared/lib/open-profile-return";
import { deviceWasRegistered, markRegisteredDevice, rememberAccountEmail, rememberedEmail } from "@/shared/lib/registered-device";
import { clearRegistrationRequired, ignoreNextSignedOut } from "@/shared/lib/session-bootstrap";
import { createBrowserSupabaseClient } from "@/shared/lib/supabase/browser";
import { isAccountEmail } from "@/shared/services/contact-item";
import { uploadAttachment } from "@/shared/services/attachment-upload";
import { recordConsent } from "@/shared/services/consent-client";
import { scheduleItemUpsert } from "@/shared/services/card-items-sync";
import { HANDLE_RE } from "@/shared/services/card-handle";
import { ensureCardIdentity, hydrateCardsFromServer } from "@/shared/services/card-sync";
import type { Card } from "@/shared/types";
import { useAppStore } from "@/shared/store/app-store";
import { useUploadStatus } from "@/shared/store/upload-status";
import { useKeyboardLift } from "@/shared/hooks/use-keyboard-lift";
import { signInHref, type EntryInput } from "./door";
import { EntryName } from "./entry-name";
import { ENTRY_MARK, EntryZones, RequiredStar, type EntryZonesHandle } from "./entry-zones";

const PAD = "px-[calc(clamp(24px,6.1vw,28px)-3mm)]";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PASSWORD_MIN = 8;
const CHECK_NOTICE = "Please check the fields in red";

export type { EntryInput };

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

/** Closed password in the same shape as the open one: four marks, a hyphen, four marks. */
function HiddenPassword({ value }: { value: string }) {
  const tail = value.slice(-2);
  const head = value.slice(0, -2);
  const parts = head.split(/(-)/).filter((part) => part.length > 0);
  return (
    <span aria-hidden className="t-body pointer-events-none absolute inset-0 truncate text-[var(--ink)]">
      {parts.map((part, index) =>
        part === "-" ? (
          <span key={index}>-</span>
        ) : (
          <span key={index} style={{ letterSpacing: "0.16em" }}>
            {"•".repeat(part.length)}
          </span>
        ),
      )}
      <span>{tail}</span>
    </span>
  );
}

function subscribeDevice() {
  return () => {};
}

/** The saved questionnaire holds something the person typed or picked, not only what the page offered. */
function questionnaireFilled(saved: QuestionnairePlace, offeredName: string, offeredEmail: string, photo: () => boolean) {
  return (
    saved.agreed ||
    saved.name.trim() !== offeredName ||
    saved.email.trim().toLowerCase() !== offeredEmail ||
    Boolean(saved.editText.trim() || saved.seedText.trim()) ||
    saved.zones.some((zone) => zone.custom || zone.rows.some((row) => row.value.trim())) ||
    photo()
  );
}

const filledHrefs = new Set<string>();

/** Back to this tab's questionnaire: the form opens at once instead of 01 / 02. */
function questionnaireBack(offeredName: string, offeredEmail: string) {
  if (window.history.state?.compassForm) return true;
  const here = window.location.pathname + window.location.search;
  const saved = readQuestionnaire();
  if (!saved || saved.href !== here) return false;
  if (filledHrefs.has(here)) return true;
  if (!questionnaireFilled(saved, offeredName, offeredEmail, () => Boolean(readQuestionnairePhoto(here)))) return false;
  filledHrefs.add(here);
  return true;
}

export function EntryPage({
  input,
  pick = false,
  telegram = false,
  account = false,
  needsConsent = false,
  savedContact = false,
}: {
  input: EntryInput;
  pick?: boolean;
  /** First open of an invitation inside Telegram. */
  telegram?: boolean;
  /** Already signed in, and the server confirmed there is no portfolio yet. */
  account?: boolean;
  /** The Google return did not manage to store the agreement. */
  needsConsent?: boolean;
  /** The card they opened is already in Network. The dot is this browser's, so the page sets it. */
  savedContact?: boolean;
}) {
  const router = useRouter();
  const knownDevice = useSyncExternalStore(subscribeDevice, deviceWasRegistered, () => false);
  const markedContact = useRef(false);
  useLayoutEffect(() => {
    if (!pick || !knownDevice || !input.sourceToken) return;
    router.replace(signInHref(rememberedEmail() || undefined, input));
  }, [pick, knownDevice, input, router]);
  useLayoutEffect(() => {
    if (!savedContact || markedContact.current) return;
    markedContact.current = true;
    markNewContact();
    const url = new URL(window.location.href);
    url.searchParams.delete("saved");
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(window.history.state, "", next);
    router.replace(next);
  }, [savedContact, router]);
  const offeredName = input.name?.trim() ?? "";
  const offeredEmail = input.email?.trim().toLowerCase() ?? "";
  const [name, setName] = useState(offeredName);
  const [nameLive, setNameLive] = useState(!offeredName);
  const [email, setEmail] = useState(offeredEmail);
  const [emailLive, setEmailLive] = useState(!offeredEmail);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [photo, setPhoto] = useState<{ file: File; dataUrl: string } | null>(null);
  const [agreed, setAgreed] = useState(account && !needsConsent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailMarked, setEmailMarked] = useState(false);
  const formFirst = account || !SOCIAL_SIGNIN;
  const [formChoice, setFormChoice] = useState<boolean | null>(null);
  const formBack = useSyncExternalStore(
    subscribeDevice,
    () => !formFirst && formChoice === null && questionnaireBack(offeredName, offeredEmail),
    () => false,
  );
  const formOpen = formChoice ?? (formFirst || formBack);
  const formPushed = useRef(false);
  const mainRef = useRef<HTMLElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const zonesRef = useRef<EntryZonesHandle>(null);
  const keepPlace = useRef(false);
  const submitLock = useRef(false);
  const [placeReady, setPlaceReady] = useState(false);
  const [sidePad, setSidePad] = useState(() => carouselSidePaddingPx(0, true));
  const [passwordValue, setPasswordValue] = useState<string | null>(null);
  const passwordShown = passwordValue ?? "";
  const ready = account
    ? Boolean(name.trim() && (!needsConsent || agreed))
    : Boolean(agreed && isAccountEmail(email) && passwordShown.length >= PASSWORD_MIN);
  const frame = { paddingLeft: sidePad, paddingRight: sidePad };

  const fields = useRef({ name, email, password: passwordShown, agreed });
  fields.current = { name, email, password: passwordShown, agreed };
  const photoRef = useRef(photo);
  photoRef.current = photo;

  const flushPlace = () => {
    if (!keepPlace.current || passwordValue === null) return;
    const place = zonesRef.current?.place();
    if (!place) return;
    const href = window.location.pathname + window.location.search;
    writeQuestionnaire({
      href,
      ...fields.current,
      ...place,
    });
    writeQuestionnairePhoto(href, photoRef.current?.dataUrl ?? null);
  };

  useEffect(() => {
    formPushed.current = Boolean(window.history.state?.compassForm);
    const onPop = () => {
      if (!formPushed.current || window.history.state?.compassForm) return;
      formPushed.current = false;
      setFormChoice(false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const openForm = () => {
    window.history.pushState({ compassForm: 1 }, "");
    formPushed.current = true;
    setFormChoice(true);
  };

  const closeForm = () => {
    if (formPushed.current && window.history.state?.compassForm) {
      window.history.back();
      return;
    }
    formPushed.current = false;
    setFormChoice(false);
  };

  useEffect(() => {
    const saved = readQuestionnaire();
    const here = window.location.pathname + window.location.search;
    if (saved && saved.href === here) {
      setName(saved.name);
      setNameLive(true);
      setEmail(saved.email);
      setEmailLive(true);
      issuedPassword = saved.password;
      setPasswordValue(saved.password);
      setAgreed(saved.agreed);
      zonesRef.current?.restore(saved);
      const dataUrl = readQuestionnairePhoto(here);
      const file = dataUrl ? photoFileFromDraft(dataUrl) : null;
      if (dataUrl && file) setPhoto({ file, dataUrl });
    } else {
      setPasswordValue((current) => current ?? passwordNow());
    }
    setPlaceReady(true);
    track("create_view");
  }, []);

  useEffect(() => {
    if (!placeReady) return;
    keepPlace.current = true;
    flushPlace();
  }, [placeReady, name, email, passwordShown, agreed, photo]);

  useEffect(() => {
    const leave = () => flushPlace();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") leave();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", leave);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", leave);
    };
  }, [passwordValue]);

  useEffect(() => {
    const measure = () => setSidePad(carouselSidePaddingPx(window.innerWidth, true));
    measure();
    window.addEventListener("orientationchange", measure);
    return () => window.removeEventListener("orientationchange", measure);
  }, []);

  useKeyboardLift(mainRef);

  const submit = async () => {
    if (busy || !ready || submitLock.current) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement) flushSync(() => active.blur());
    track("create_submit");
    const first = zonesRef.current?.markProblems() ?? null;
    const emailBad = account ? false : !isAccountEmail(email);
    setEmailMarked(emailBad);
    if (first || emailBad) {
      setError(CHECK_NOTICE);
      const redZone = first?.startsWith("seed:") ? first.slice(5) : zonesRef.current?.snapshot().find((zone) => zone.rows.some((row) => row.key === first))?.id;
      track("create_red", [redZone, emailBad ? "email" : ""].filter(Boolean).join(",") || undefined);
      const mark = first;
      requestAnimationFrame(() => {
        const root = mainRef.current;
        const target = !root
          ? null
          : mark?.startsWith("seed:")
            ? root.querySelector(`[data-entry-seed="${CSS.escape(mark.slice(5))}"]`)
            : mark
              ? root.querySelector(`[data-entry-row="${CSS.escape(mark)}"]`)
              : emailRef.current;
        target?.scrollIntoView({ block: "center" });
      });
      return;
    }
    if (!account) {
      const emailValue = email.trim().toLowerCase();
      const secret = passwordShown;
      submitLock.current = true;
      setBusy(true);
      setError(null);
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
          }),
        });
        const reply = (await response.json().catch(() => ({}))) as {
          kind?: string;
          saved?: boolean;
          warning?: string;
        };
        if (response.status === 409 || reply.kind === "login") {
          setError("This email already has an account.");
          track("signup_fail", reply.kind);
          submitLock.current = false;
          setBusy(false);
          return;
        }
        if (!response.ok) {
          setError("Could not create the account.");
          track("signup_fail", reply.kind);
          submitLock.current = false;
          setBusy(false);
          return;
        }
        created = true;
        track("signup_ok");
        keepPlace.current = false;
        clearFillPlace();
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
          track("signup_fail", "signin");
          submitLock.current = false;
          setBusy(false);
          return;
        }
        useAppStore.getState().resetApp();
        markRegisteredDevice();
        rememberAccountEmail(emailValue);
        clearRegistrationRequired();
        useAppStore.setState({ user: { ...useAppStore.getState().user, onboarded: true } });
        const query = new URLSearchParams();
        query.set("account", "1");
        if (reply.saved && !reply.warning) query.set("saved", "1");
        if (input.sourceToken) query.set("card", input.sourceToken);
        if (input.event) {
          query.set("event", input.event.lookup);
          if (input.event.guestToken) query.set("g", input.event.guestToken);
        }
        if (input.next) query.set("next", input.next);
        router.replace(`/create?${query.toString()}`);
      } catch {
        setError(created ? "Account created, but sign-in failed — tap Sign in." : "Could not create the account.");
        track("signup_fail", created ? "signin" : undefined);
        submitLock.current = false;
        setBusy(false);
      }
      return;
    }
    const zones = zonesRef.current?.snapshot() ?? [];
    const emailValue = email.trim().toLowerCase();
    const titleValue = name.trim();
    const secret = passwordShown;
    submitLock.current = true;
    setBusy(true);
    setError(null);
    let created = false;
    try {
      if (account && needsConsent) await recordConsent("register");
      const response = await fetch(account ? "/api/portfolio/first" : "/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify({
          ...(account ? {} : { email: emailValue, password: secret }),
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
        handle?: string | null;
        saved?: boolean;
        savedName?: string;
        existing?: boolean;
        joined?: boolean;
        pay?: boolean;
        eventLookup?: string;
        warning?: string;
      };
      if (response.status === 409 || reply.kind === "login") {
        setError("This email already has an account.");
        track("signup_fail", reply.kind);
        submitLock.current = false;
        setBusy(false);
        return;
      }
      if (!response.ok || !reply.cardId) {
        setError("Could not create your profile.");
        track("signup_fail", reply.kind);
        submitLock.current = false;
        setBusy(false);
        return;
      }
      const cardId = reply.cardId;
      created = true;
      track("signup_ok");
      keepPlace.current = false;
      clearFillPlace();
      (document.activeElement as HTMLElement | null)?.blur();
      if (account && reply.existing) {
        useAppStore.setState({ user: { ...useAppStore.getState().user, onboarded: true } });
        void hydrateCardsFromServer();
        router.replace("/main");
        return;
      }
      if (!account) {
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
          track("signup_fail", "signin");
          submitLock.current = false;
          setBusy(false);
          return;
        }
      }
      const now = new Date().toISOString();
      const givenHandle = reply.handle?.trim().toLowerCase() ?? "";
      const portfolio: Card = ensureCardIdentity({
        id: cardId,
        displayName: titleValue,
        photo: photo?.dataUrl,
        photoLook: photo ? "shadow" : undefined,
        title: reply.title?.trim() ?? "",
        ...(reply.headerItemId ? { headerItemId: reply.headerItemId } : {}),
        status: "published",
        publicToken: reply.publicToken ?? "",
        ...(givenHandle && HANDLE_RE.test(givenHandle) ? { handle: givenHandle } : {}),
        qrVersion: 1,
        contactItemIds: reply.itemIds ?? [],
        rubricOrder: zones.map((zone) => zone.id),
        rubricLabels: Object.fromEntries(zones.flatMap((zone) => (zone.title.trim() ? [[zone.id, zone.title.trim()]] : []))),
        itemZones: reply.itemZones,
        listed: true,
        nextScanAddons: [],
        createdAt: now,
        updatedAt: now,
      });
      if (account) {
        markRegisteredDevice();
        const user = useAppStore.getState().user;
        useAppStore.setState({
          user: { ...user, onboarded: true },
          cards: [portfolio],
          currentCardIndex: 0,
          contactItems: [],
        });
      } else {
        useAppStore.getState().resetApp();
        markRegisteredDevice();
        rememberAccountEmail(email);
        clearRegistrationRequired();
        useAppStore.setState({
          user: { ...useAppStore.getState().user, onboarded: true },
          cards: [portfolio],
          currentCardIndex: 0,
          contactItems: [],
        });
      }
      const rows = zones.flatMap((zone) => zone.rows);
      const files = (reply.fileItems ?? []).flatMap((item) => {
        const row = rows.find((entry) => entry.key === item.key);
        return row?.file && row.type ? [{ itemId: item.itemId, file: row.file, type: row.type }] : [];
      });
      for (const item of files) {
        useUploadStatus.getState().setStatus(item.itemId, { state: "uploading", percent: null });
      }
      if (reply.joined && input.event) {
        router.replace("/main");
      } else if (input.sourceToken && reply.saved && !reply.warning) {
        markNewContact();
        router.replace("/main");
      } else {
        if (input.event?.lookup) rememberOpenProfile(input.event.lookup);
        router.replace("/main");
      }
      void (async () => {
        const synced = hydrateCardsFromServer();
        if (photo) {
          try {
            const readyPhoto = await uploadAttachment({ file: photo.file, kind: "card-photo", cardId });
            useAppStore.getState().updateCard(cardId, { photoAttachmentId: readyPhoto.attachmentId, photoLook: "shadow" });
          } catch {
            try {
              sessionStorage.setItem("aded-photo-missed", "1");
            } catch {
              // The portfolio is already open. A private tab cannot keep the reminder.
            }
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
        track("signup_fail", "signin");
      } else {
        setError("Could not create your profile.");
        track("signup_fail");
      }
      submitLock.current = false;
      setBusy(false);
    }
  };

  if (pick && knownDevice) return <div className="fixed inset-0 bg-white" aria-hidden />;

  const acceptSuggestedName = (event: { target: EventTarget | null }) => {
    const node = event.target;
    if (!(node instanceof HTMLElement)) return;
    if (node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement || node.isContentEditable) {
      setNameLive(true);
    }
  };

  const focusEmpty = () => {
    const root = mainRef.current;
    if (!root) return;
    if (!name.trim()) {
      const area = root.querySelector("[data-entry-name] textarea");
      if (area instanceof HTMLTextAreaElement) {
        area.focus();
        return;
      }
    }
    zonesRef.current?.focusFirstEmpty();
  };

  const socialNext = input.event
    ? input.event.guestToken
      ? `/e/${encodeURIComponent(input.event.lookup)}?g=${encodeURIComponent(input.event.guestToken)}&go=1`
      : `/e/${encodeURIComponent(input.event.lookup)}`
    : input.sourceToken
      ? `/save/${input.sourceToken}`
      : input.next;

  if (!account) {
    return (
      <main ref={mainRef} className="compass-main h-[100svh] overflow-y-auto overscroll-contain bg-background text-[var(--ink)]">
        <BackButton fallbackHref="/" />
        <AuthModeToggle
          mode="up"
          pinned={false}
          signUpHref="/create"
          signInHref={signInHref(undefined, input)}
          className="mb-[18px]"
        />
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div style={frame}>
            <div className={PAD}>
              {telegram ? (
                <p className="mb-[18px] t-meta text-[var(--grey)]">
                  Open in your browser: ••• → Open in Safari, so your card stays with you.
                </p>
              ) : null}
              <section className="grid grid-cols-[86px_minmax(0,1fr)] items-start gap-x-[14px] border-b border-[var(--rule)] py-[18px]">
                <div className="min-w-0">
                  <SectionNumber value="01" />
                  <span className="mt-[6px] block t-label text-[var(--grey)]">With</span>
                </div>
                <div className="min-w-0">
                  <SocialSignInRows from="create" next={socialNext} />
                  <p className="m-0 t-meta text-[var(--grey)]">
                    By continuing you agree to{" "}
                    <Link href="/terms" className="underline">
                      Terms
                    </Link>{" "}
                    and{" "}
                    <Link href="/privacy" className="underline">
                      Privacy
                    </Link>
                    .
                  </p>
                </div>
              </section>
              <section className="grid grid-cols-[86px_minmax(0,1fr)] items-start gap-x-[14px] border-b border-[var(--rule)] py-[18px]">
                <div className="min-w-0">
                  <SectionNumber value="02" />
                  <span className="mt-[6px] block t-label text-[var(--grey)]">Email</span>
                </div>
                <div className="flex min-w-0 flex-col gap-[14px]">
                  <input
                    ref={emailRef}
                    type="email"
                    inputMode="email"
                    autoCapitalize="none"
                    autoComplete="email"
                    name="username"
                    aria-label="Email"
                    placeholder="name@mail.com"
                    value={email}
                    onFocus={() => setEmailLive(true)}
                    onChange={(event) => {
                      setEmailLive(true);
                      setEmail(event.target.value);
                    }}
                    className="t-body m-0 w-full border-0 border-b border-[var(--rule)] bg-transparent p-0 outline-none placeholder:text-[var(--placeholder)]"
                    style={{ color: emailMarked ? ENTRY_MARK : emailLive ? "var(--ink)" : "var(--placeholder)" }}
                  />
                  <span className="flex min-w-0 items-center gap-2 border-b border-[var(--rule)]">
                    <span className="relative min-w-0 flex-1">
                      <input
                        type="text"
                        autoComplete="new-password"
                        name="password"
                        aria-label="Password"
                        value={passwordShown}
                        onChange={(event) => setPasswordValue(event.target.value)}
                        className="t-body m-0 w-full min-w-0 border-0 bg-transparent p-0 outline-none"
                        style={{ color: passwordVisible ? "var(--ink)" : "transparent", caretColor: "var(--ink)" }}
                      />
                      {passwordVisible ? null : <HiddenPassword value={passwordShown} />}
                    </span>
                    <button
                      type="button"
                      aria-label={passwordVisible ? "Hide password" : "Show password"}
                      className="shrink-0 border-0 bg-transparent p-0 text-[var(--ink)]"
                      onClick={() => setPasswordVisible((current) => !current)}
                    >
                      {passwordVisible ? <Eye className="size-4" strokeWidth={1.5} /> : <EyeOff className="size-4" strokeWidth={1.5} />}
                    </button>
                  </span>
                  {passwordShown.length > 0 && passwordShown.length < PASSWORD_MIN ? (
                    <p className="m-0 t-meta text-[var(--ink)]">At least 8 characters.</p>
                  ) : null}
                  <p className="m-0 t-meta text-[var(--ink)]">You can change it anytime in Profile.</p>
                  <span className="flex min-w-0 items-center gap-2">
                    <label htmlFor="create-terms" className="t-meta min-w-0 text-[var(--ink)]">
                      I agree with{" "}
                      <Link href="/terms" className="underline">
                        terms
                      </Link>{" "}
                      and{" "}
                      <Link href="/privacy" className="underline">
                        privacy
                      </Link>
                    </label>
                    <Checkbox
                      id="create-terms"
                      checked={agreed}
                      onCheckedChange={(value) => setAgreed(value === true)}
                      aria-label="I agree with terms and privacy"
                      className="ml-auto size-4 shrink-0 rounded-none border border-[var(--rule)] bg-white"
                    />
                  </span>
                  {error ? <p className="m-0 t-meta text-[var(--ink)]">{error}</p> : null}
                  <button
                    type="submit"
                    disabled={!ready || busy}
                    className="press mt-[18px] w-full border-0 bg-sky px-6 py-3 t-caps text-[var(--ink)] shadow-none disabled:text-[var(--grey)] [-webkit-tap-highlight-color:transparent]"
                  >
                    Sign up
                  </button>
                </div>
              </section>
            </div>
          </div>
          <div className="pb-[max(24px,env(safe-area-inset-bottom))]" />
        </form>
      </main>
    );
  }

  const sheet = (
    <>
      {account ? (
        <div className="px-[var(--gutter)] pt-[calc(env(safe-area-inset-top)+14px)]">
          <div className="mb-[18px] flex justify-end">
            <button
              type="button"
              aria-label="Info"
              onClick={() => router.push("/info")}
              className="border-0 bg-transparent p-0 text-[var(--ink)]"
            >
              <span className="block text-center leading-none" style={{ fontSize: 22, fontWeight: 400 }}>
                i
              </span>
            </button>
          </div>
        </div>
      ) : (
        <>
          <BackButton fallbackHref="/" onBack={formOpen && SOCIAL_SIGNIN ? closeForm : undefined} />
          <AuthModeToggle
            mode="up"
            pinned={false}
            signUpHref="/create"
            signInHref={signInHref(undefined, input)}
            className="mb-[18px]"
          />
          {formOpen ? null : (
            <div style={frame}>
              <div className={PAD}>
                <section className="grid grid-cols-[86px_minmax(0,1fr)] items-start gap-x-[14px] border-b border-[var(--rule)] py-[18px]">
                  <div className="min-w-0">
                    <SectionNumber value="01" />
                    <span className="mt-[6px] block t-label text-[var(--grey)]">With</span>
                  </div>
                  <div className="min-w-0">
                    <SocialSignInRows
                      from="create"
                      next={
                        input.event
                          ? input.event.guestToken
                            ? `/e/${encodeURIComponent(input.event.lookup)}?g=${encodeURIComponent(input.event.guestToken)}&go=1`
                            : `/e/${encodeURIComponent(input.event.lookup)}`
                          : input.sourceToken
                            ? `/save/${input.sourceToken}`
                            : input.next
                      }
                    />
                    <p className="m-0 t-meta text-[var(--grey)]">
                      By continuing you agree to{" "}
                      <Link href="/terms" className="underline">
                        Terms
                      </Link>{" "}
                      and{" "}
                      <Link href="/privacy" className="underline">
                        Privacy
                      </Link>
                      .
                    </p>
                  </div>
                </section>
                <section className="grid grid-cols-[86px_minmax(0,1fr)] items-start gap-x-[14px] border-b border-[var(--rule)] py-[18px]">
                  <div className="min-w-0">
                    <SectionNumber value="02" />
                    <span className="mt-[6px] block t-label text-[var(--grey)]">Form</span>
                  </div>
                  <button
                    type="button"
                    onClick={openForm}
                    className="press flex min-h-11 min-w-0 items-center gap-3 border-0 bg-transparent p-0 text-left t-body text-[var(--ink)]"
                    style={{ marginTop: ROW_LINE_TRIM }}
                  >
                    Create portfolio now
                    <ChevronDown className="size-4 shrink-0 text-[var(--ink)]" strokeWidth={1.5} aria-hidden />
                  </button>
                </section>
              </div>
            </div>
          )}
        </>
      )}
      <div
        style={frame}
        className={[!formOpen && "hidden", !account && "pt-[18px]"].filter(Boolean).join(" ") || undefined}
      >
      <div className={PAD} onFocusCapture={acceptSuggestedName}>
        {telegram ? (
          <p className="mb-[18px] t-meta text-[var(--grey)]">
            Open in your browser: ••• → Open in Safari, so your card stays with you.
          </p>
        ) : null}
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
              <span className="t-body pointer-events-none absolute inset-0 flex items-center justify-center text-center text-[var(--placeholder)]">
                Photo
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
        <EntryZones
          ref={zonesRef}
          onChange={() => {
            flushPlace();
          }}
        />
      </div>
      </div>
      <form
        className={formOpen ? undefined : "hidden"}
        onFocusCapture={acceptSuggestedName}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
      {account ? null : (
      <div className="bg-sky py-[18px]">
        <div style={frame}>
        <div className={`${PAD} flex flex-col gap-[14px]`}>
          <label className="grid grid-cols-[86px_minmax(0,1fr)] items-center gap-x-[14px] border-b border-[var(--rule)]">
            <span className="t-label whitespace-normal">
              Profile email
              <RequiredStar className="top-[calc(-0.35em+3px)] ml-[calc(0.15em-3px)]" />
            </span>
            <input
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoComplete="email"
              name="username"
              aria-label="Profile email"
              placeholder="name@mail.com"
              value={email}
              onFocus={() => setEmailLive(true)}
              onChange={(event) => {
                setEmailLive(true);
                setEmail(event.target.value);
              }}
              className="t-body m-0 w-full border-0 bg-transparent p-0 outline-none placeholder:text-[var(--placeholder)]"
              style={{ color: emailMarked ? ENTRY_MARK : emailLive ? "var(--ink)" : "var(--placeholder)" }}
            />
          </label>
          <label className="grid grid-cols-[86px_minmax(0,1fr)] items-center gap-x-[14px] border-b border-[var(--rule)]">
            <span className="t-label">Password</span>
            <span className="flex min-w-0 items-center gap-2">
              <input
                type={passwordVisible ? "text" : "password"}
                autoComplete="new-password"
                name="password"
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
          <div className="grid grid-cols-[86px_minmax(0,1fr)] items-center gap-x-[14px]">
            <span />
            <span className="flex min-w-0 items-center gap-2">
              <label htmlFor="create-terms" className="t-meta min-w-0 text-[var(--ink)]">
                I agree with{" "}
                <Link href="/terms" className="underline">
                  terms
                </Link>{" "}
                and{" "}
                <Link href="/privacy" className="underline">
                  privacy
                </Link>
              </label>
              <Checkbox
                id="create-terms"
                checked={agreed}
                onCheckedChange={(value) => setAgreed(value === true)}
                aria-label="I agree with terms and privacy"
                className="ml-auto size-4 shrink-0 rounded-none border border-[var(--rule)] bg-white"
              />
            </span>
          </div>
        </div>
        </div>
      </div>
      )}
      <div style={frame}>
      <div className={`${PAD} flex flex-col gap-4 pt-[18px] pb-[max(24px,env(safe-area-inset-bottom))]`}>
        {account && needsConsent ? (
          <div className="grid grid-cols-[86px_minmax(0,1fr)] items-center gap-x-[14px]">
            <span />
            <span className="flex min-w-0 items-center gap-2">
              <label htmlFor="create-terms" className="t-meta min-w-0 text-[var(--ink)]">
                I agree with{" "}
                <Link href="/terms" className="underline">
                  terms
                </Link>{" "}
                and{" "}
                <Link href="/privacy" className="underline">
                  privacy
                </Link>
              </label>
              <Checkbox
                id="create-terms"
                checked={agreed}
                onCheckedChange={(value) => setAgreed(value === true)}
                aria-label="I agree with terms and privacy"
                className="ml-auto size-4 shrink-0 rounded-none border border-[var(--rule)] bg-white"
              />
            </span>
          </div>
        ) : null}
        {error ? <p className="m-0 t-meta text-[var(--ink)]" style={{ marginLeft: VALUE_AXIS_PX }}>{error}</p> : null}
        <div className="grid grid-cols-[86px_minmax(0,1fr)] gap-x-[14px]">
          <span />
          <TapButton
            type="submit"
            onTap={() => void submit()}
            disabled={!ready || busy}
            className="w-full bg-sky px-[21.6px] py-[10.8px] text-center t-band leading-[calc(13px*1.45)] text-[var(--ink)] disabled:text-[var(--grey)]"
          >
            {busy ? "Creating…" : "Create portfolio"}
          </TapButton>
        </div>
      </div>
      </div>
      </form>
    </>
  );

  if (account) {
    return (
      <div className="compass-main flex h-dvh flex-col overflow-hidden bg-background text-[var(--ink)]">
        <main ref={mainRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {sheet}
        </main>
        <BottomNav
          onEdit={focusEmpty}
          onProfile={() => router.push("/profile")}
          onNetwork={() => router.push("/network")}
        />
      </div>
    );
  }

  return (
    <main ref={mainRef} className="compass-main h-[100svh] overflow-y-auto overscroll-contain bg-background text-[var(--ink)]">
      {sheet}
    </main>
  );
}
