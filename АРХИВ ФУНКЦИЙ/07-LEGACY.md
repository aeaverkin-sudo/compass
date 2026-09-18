# Legacy код

> Компоненты и сервисы, которые **не используются** в текущих экранах, но остались в репозитории.

---

## Legacy Components

### PortfolioQR
**Путь:** `src/features/portfolio/components/portfolio-qr.tsx`  
**Замена:** `QrZone`  
**Статус:** не импортируется активными экранами

### PortfolioPreview
**Путь:** `src/features/portfolio/components/portfolio-preview.tsx`  
**Замена:** `PortfolioStack` + `BusinessCard`  
**Статус:** старый portfolio preview со swipe

### ContentWheel
**Путь:** `src/features/portfolio/components/content-wheel.tsx`  
**Замена:** `LibraryPanel`  
**Статус:** infinite-scroll slot wheel (старая модель)

### ContentFieldRow
**Путь:** `src/features/portfolio/components/content-field-row.tsx`  
**Замена:** `LibraryPanel` rows  
**Статус:** single content slot row editor

### DataLayer (удалён)
**Был:** `src/features/portfolio/components/data-layer.tsx`  
**Замена:** `LibraryPanel`

### EditorRow (удалён)
**Был:** `src/features/portfolio/components/editor-row.tsx`  
**Замена:** inline edit в `LibraryPanel`

---

## Legacy Services

### content-detector.ts
**Путь:** `src/features/portfolio/services/content-detector.ts`  
**Модель:** ContentSlot  
**Замена:** `contact-item.ts` (ContactItem model)

Functions:
- `detectContentType`
- `deriveLabel`
- `isSlotFilled`
- `slotDisplayLabel`

### portfolio-factory.ts
**Путь:** `src/features/portfolio/services/portfolio-factory.ts`  
**Модель:** Portfolio  
**Замена:** `contact-item.ts` (Card model)

Functions:
- `createEmptySlot`
- `createPortfolio`
- `getFullName`
- `isQrReady`
- `getActiveSlots`
- `sortLibrarySlots`
- `buildPortfolioSnapshot`
- `emptyFieldPlaceholder`

---

## Legacy Types

| Type | Замена | Статус |
|------|--------|--------|
| `Portfolio` | `Card` | @deprecated, auto-migrated |
| `ContentSlot` | `ContactItem` | @deprecated, auto-migrated |
| `ContentType` | `ContactType` | @deprecated |
| `PortfolioSnapshot` | `CardSnapshot` | alias, @deprecated |

---

## Data Model Migration (v1/v2 → v3)

Автоматически при rehydrate из localStorage:

```
contentLibrary[]        →  contactItems[]
portfolios[]            →  cards[]
currentPortfolioIndex   →  currentCardIndex
ContentSlot fields      →  ContactItem fields
Portfolio.firstName/lastName  →  Card.displayName
Portfolio.activeSlotIds →  Card.contactItemIds
```

Migration function: `migratePersistedState()` in app-store.ts

---

## Что можно удалить при перезапуске

Безопасно удалить:
- `portfolio-qr.tsx`
- `portfolio-preview.tsx`
- `content-wheel.tsx`
- `content-field-row.tsx`
- `content-detector.ts`
- `portfolio-factory.ts`
- Deprecated types: `Portfolio`, `ContentSlot`, `ContentType`, `PortfolioSnapshot`

Сохранить (логика):
- `contact-item.ts`
- `messenger-parse.ts`
- `portfolio-pdf.ts`
- `app-store.ts` (без migration helpers после чистого старта)
