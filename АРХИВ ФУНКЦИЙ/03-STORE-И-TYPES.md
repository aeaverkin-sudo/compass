# Store и Types

## Zustand Store

**Файл:** `src/shared/store/app-store.ts`  
**Export:** `useAppStore` (Zustand + persist middleware)  
**Persist key:** `compass-storage-v3`

---

## Persisted State

```typescript
{
  user: User;
  cards: Card[];
  contactItems: ContactItem[];
  currentCardIndex: number;
  people: Person[];
  events: EventSpace[];
}
```

---

## Runtime-only State

| Field | Type | Описание |
|-------|------|----------|
| `hydrated` | `boolean` | Rehydration complete |
| `qrFlashKey` | `number` | Incremented для QR flash animation |

---

## Actions

| Action | Signature | Поведение |
|--------|-----------|-----------|
| `setHydrated` | `(v: boolean) => void` | Mark store rehydrated |
| `triggerQrFlash` | `() => void` | Increment qrFlashKey |
| `onboard` | `() => void` | Set user.onboarded = true |
| `setTier` | `(tier: SubscriptionTier) => void` | Change subscription tier |
| `setCurrentCardIndex` | `(index: number) => void` | Switch active card |
| `addCard` | `() => boolean` | Add card if under tier limit; flash QR |
| `updateCard` | `(id, data: Partial<Card>) => void` | Patch card + updatedAt |
| `addContactItem` | `() => boolean` | Add empty library row if no drafts & under slot limit |
| `updateContactItem` | `(itemId, data) => void` | Patch item; re-detect type on value change |
| `deleteContactItem` | `(itemId) => void` | Remove item + unlink from all cards |
| `purgeEmptyContactItems` | `() => void` | Remove unfilled items + unlink from cards |
| `addItemToCard` | `(cardId, itemId) => void` | Prepend item to card; flash QR |
| `removeItemFromCard` | `(cardId, itemId) => void` | Remove item from card; flash QR |
| `addPerson` | `(person: Omit<Person, "id" \| "createdAt">) => void` | Prepend person with nanoid |
| `updatePerson` | `(id, data: Partial<Person>) => void` | Patch person |
| `addNote` | `(personId, note) => void` | Prepend note to person |
| `joinEvent` | `(code: string) => EventSpace \| null` | Join demo event by code |
| `setEventMatchingQuery` | `(eventId, query) => void` | Save matching query on event |

---

## Migration Helpers (internal)

| Function | Описание |
|----------|----------|
| `slotToContactItem(slot, order)` | Migrate legacy ContentSlot → ContactItem |
| `portfolioToCard(p, sortOrder)` | Migrate legacy Portfolio → Card |
| `migratePersistedState(raw)` | v1/v2 → v3 migration; ensures ≥1 card |

---

## Types

**Файл:** `src/shared/types/index.ts`

### Enums / Unions

| Type | Values |
|------|--------|
| `SubscriptionTier` | `"free" \| "business" \| "professional" \| "conference"` |
| `ContactType` | instagram, linkedin, website, email, phone, pdf, telegram, whatsapp, audio, text, link, custom |
| `NextScanAddonType` | `"text" \| "voice" \| "selfie"` |
| `ContentType` | **@deprecated** — link, pdf, image, text, empty |

### Constants

| Name | Value |
|------|-------|
| `MAX_NEXT_SCAN_NOTES` | `3` |

### Interfaces

#### NextScanAddon
```
id, type, content, createdAt
```
One-time delivery on scan

#### ContactItem
```
id, type, label, value, url, order, createdAt
```
Global library item

#### Card
```
id, label, displayName, photo?, title, subtitle, description, location,
contactItemIds[], nextScanAddons[], sortOrder, createdAt, updatedAt
```
Active card model

#### User
```
id, name, email?, tier, onboarded
```

#### PersonNote
```
id, type (text/voice), content, createdAt
```

#### PersonContext
```
eventId?, eventName?, location?, date, metAt?
```

#### CardSnapshot
```
label, displayName, photo?, title, subtitle, description, location,
items[], nextScanAddons?
```
Share payload

#### Person
```
id, direction (received/sent), name, photo?, selfiePhoto?, showSelfie,
headline, description, slots[], context, notes[], privateSave,
savedByName?, positiveOutcome, createdAt
```
CRM contact

#### EventSpace
```
id, name, code, location, startDate, endDate, activeUntil,
joinedAt, matchingQuery?
```

#### MatchingProfile (demo)
```
id, name, photo?, headline, relevance, reason, location, tags[]
```

#### PortfolioAnalytics (demo)
```
portfolioId, portfolioName, opened, linksOpened, pitchDeck, website, instagram
```

### Deprecated

| Type | Замена |
|------|--------|
| `Portfolio` | `Card` |
| `ContentSlot` | `ContactItem` |
| `PortfolioSnapshot` | `CardSnapshot` |

---

## Tier Limits

**Файл:** `src/shared/constants/tiers.ts`

| Tier | maxPortfolios (cards) | maxSlots (library items) |
|------|----------------------|--------------------------|
| free | 2 | 5 |
| business | 5 | 15 |
| professional | 10 | 30 |
| conference | 10 | 30 |
