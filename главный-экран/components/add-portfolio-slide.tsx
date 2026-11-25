"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { PhotoSlotPicker } from "@landing/components/photo-slot-picker";
import { EntryName } from "@/app/create/entry-name";
import { EntryZones, type EntryZonesHandle } from "@/app/create/entry-zones";
import { TapButton } from "@/shared/components/tap-button";
import { bindKeyboardLift } from "@/shared/hooks/use-keyboard-lift";
import { uploadAttachment } from "@/shared/services/attachment-upload";
import { isContactFilled } from "@/shared/services/contact-item";
import { useAppStore } from "@/shared/store/app-store";

function readFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("file"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("file"));
    reader.readAsDataURL(file);
  });
}

/**
 * The add slide. Text stays here until Create. A reload drops it.
 * A failed save keeps it and the card id, so the next Create finishes the same card.
 */
export function AddPortfolioSlide({
  portfolioLimit,
  locked,
  onBlocked,
  onShow,
}: {
  portfolioLimit: number | null;
  locked?: boolean;
  onBlocked?: () => void;
  /** Bring the add slide back into view after a failed save. */
  onShow: (index: number) => void;
}) {
  const zonesRef = useRef<EntryZonesHandle>(null);
  const creating = useRef(false);
  const cardId = useRef<string | null>(null);
  const placed = useRef(new Set<string>());
  const rowItems = useRef(new Map<string, string>());
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState<{ file: File; dataUrl: string } | null>(null);
  const [nameMarked, setNameMarked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    return bindKeyboardLift(node);
  }, [formKey]);

  const create = async () => {
    if (locked) {
      onBlocked?.();
      return;
    }
    if (busy || creating.current) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement) flushSync(() => active.blur());
    const zones = zonesRef.current;
    if (!zones) return;
    const nameMissing = !name.trim();
    setNameMarked(nameMissing);
    if (nameMissing) return;
    if (zones.markProblems()) return;

    creating.current = true;
    setBusy(true);
    setError(null);
    try {
      let id = cardId.current;
      const existing = id ? useAppStore.getState().cards.find((card) => card.id === id) : undefined;
      if (!existing) {
        if (portfolioLimit === null) {
          setError("Could not save this portfolio. Try again.");
          return;
        }
        const before = useAppStore.getState().cards.length;
        useAppStore.getState().updateSecondCardDraft(
          { displayName: name.trim(), photo: photo?.dataUrl },
          portfolioLimit,
        );
        const cards = useAppStore.getState().cards;
        const created = cards.length === before + 1 ? cards[cards.length - 1] : undefined;
        if (!created) {
          setError("Could not save this portfolio. Try again.");
          return;
        }
        id = created.id;
        cardId.current = id;
      } else if (existing.displayName !== name.trim() || (photo && existing.photo !== photo.dataUrl)) {
        useAppStore.getState().updateCard(id!, {
          displayName: name.trim(),
          ...(photo ? { photo: photo.dataUrl } : {}),
        });
      }

      if (photo) {
        const ready = await uploadAttachment({ file: photo.file, kind: "card-photo", cardId: id! });
        const current = useAppStore.getState().cards.find((card) => card.id === id);
        if (current?.photo === photo.dataUrl) {
          useAppStore.getState().updateCard(id!, { photo: undefined, photoAttachmentId: ready.attachmentId });
        }
      }

      const store = useAppStore.getState();
      for (const zone of zones.lines()) {
        for (const row of zone.rows) {
          if (placed.current.has(row.key)) continue;
          const itemId = store.addContactItem();
          if (!itemId) throw new Error("save");
          if (row.file) {
            const dataUrl = await readFile(row.file);
            const saved = store.updateContactItemAttachment(id!, itemId, row.file, dataUrl);
            if (!saved.ok) {
              store.deleteContactItem(itemId);
              throw new Error("save");
            }
          } else {
            store.updateContactItem(itemId, { value: row.value });
            const item = useAppStore.getState().contactItems.find((entry) => entry.id === itemId);
            if (!item || !isContactFilled(item)) {
              store.deleteContactItem(itemId);
              throw new Error("save");
            }
          }
          store.addItemToCard(id!, itemId, zone.id);
          rowItems.current.set(row.key, itemId);
          placed.current.add(row.key);
        }
      }

      const filled = zones.snapshot();
      const live = useAppStore.getState();
      for (const zone of filled) {
        const title = zone.title.trim();
        if (title) live.setRubricLabel(id!, zone.id, title);
      }
      live.setCardRubricOrder(
        id!,
        filled.map((zone) => zone.id),
      );
      const header = zones.headerKey();
      const headerItemId = header ? rowItems.current.get(header) : undefined;
      const headerTitle = header
        ? filled.flatMap((zone) => zone.rows).find((row) => row.key === header)?.value.trim()
        : "";
      if (headerItemId && headerTitle) {
        live.updateCard(id!, { headerItemId, title: headerTitle });
      }

      cardId.current = null;
      placed.current = new Set();
      rowItems.current = new Map();
      setName("");
      setPhoto(null);
      setNameMarked(false);
      setFormKey((key) => key + 1);
    } catch {
      setError("Could not save this portfolio. Try again.");
      onShow(useAppStore.getState().cards.length);
    } finally {
      creating.current = false;
      setBusy(false);
    }
  };

  return (
    <div
      key={formKey}
      ref={scrollRef}
      className="compass-card-scroll h-full overflow-y-auto px-[var(--gutter)] pt-[30px]"
    >
      <div className="min-h-[calc(100%+1px)]">
      <div className="flex items-stretch gap-3" style={{ height: 128 }}>
        <div className="relative shrink-0">
          <PhotoSlotPicker
            photo={photo?.dataUrl ?? null}
            onPhotoChange={(dataUrl, file) => {
              if (locked) {
                onBlocked?.();
                return;
              }
              setPhoto(dataUrl && file ? { file, dataUrl } : null);
            }}
            sizePx={128}
            borderRadiusPx={0}
            photoLook="shadow"
            surfaceClassName="bg-white"
          />
        </div>
        <EntryName
          value={name}
          live
          marked={nameMarked && !name.trim()}
          onChange={(next) => {
            if (locked) {
              onBlocked?.();
              return;
            }
            setNameMarked(false);
            setName(next);
          }}
          onTouch={() => {
            if (locked) onBlocked?.();
          }}
        />
      </div>
      <EntryZones ref={zonesRef} />
      <div className="flex justify-center pt-[18px] pb-[max(24px,env(safe-area-inset-bottom))]">
        <TapButton
          type="button"
          onTap={() => void create()}
          disabled={busy}
          className="inline-flex items-center bg-sky px-[21.6px] py-[10.8px] t-caps text-[var(--ink)] disabled:text-[var(--grey)]"
        >
          {busy ? "Creating…" : "Create portfolio"}
        </TapButton>
      </div>
      {error ? <p className="m-0 pb-6 t-meta text-[var(--ink)]">{error}</p> : null}
      </div>
    </div>
  );
}
