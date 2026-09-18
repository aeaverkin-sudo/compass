# Hooks и UI Components

## Hooks

### useSwipe

**Файл:** `src/shared/hooks/use-swipe.ts`

```typescript
useSwipe({
  onSwipeLeft?,
  onSwipeRight?,
  onSwipeUp?,
  onSwipeDown?
})
```

**Returns:** touch handlers — `onTouchStart`, `onTouchMove`, `onTouchEnd`

**Параметры:**
- Threshold: 50px minimum movement
- 60px для axis-dominant swipe

**Используется в:**
- `PortfolioStack` — переключение карточек
- `PortfolioPreview` (legacy)

---

### useLongPress

**Файл:** `src/shared/hooks/use-long-press.ts`

```typescript
useLongPress(onLongPress, delay = 700)
```

**Returns:** pointer handlers + `onClick` swallow

**Параметры:**
- Default delay: 700ms
- Move tolerance: 10px cancels timer
- onClick после long-press подавляется

**Используется в:**
- `BusinessCard` — inline edit полей, photo picker
- `LibraryPanel` — row edit, file picker на +

---

### useElementHeight

**Файл:** `src/shared/hooks/use-element-size.ts`

```typescript
useElementHeight<T>(deps = []) → { ref, height }
```

**Поведение:**
- ResizeObserver-based height measurement
- Re-measures when deps change

**Используется в:**
- `PortfolioStack` — library sheet positioning (top follows card bottom)

---

## Shared UI Components

### Button

**Файл:** `src/shared/components/ui/button.tsx`

Variants: default, ghost, outline  
Sizes: sm, md, lg

---

### Input / Textarea

**Файл:** `src/shared/components/ui/input.tsx`

- `Input` — single line
- `Textarea` — multiline

---

### Modal

**Файл:** `src/shared/components/ui/modal.tsx`

Overlay modal with close button.  
Used in: AI modals, OrganizerDashboard, NextScanMenu

---

## Layout Components

### AppShell

**Файл:** `src/shared/components/layout/app-shell.tsx`

- Wraps all pages
- Onboarding redirect logic
- Bottom nav visibility control
- Hydration gate

### BottomNav

**Файл:** `src/shared/components/layout/bottom-nav.tsx`

5 tabs: Portfolio, People, Events, Match, More (Settings)

---

## Portfolio Layout Constants

**Файл:** `src/features/portfolio/constants/layout.ts`

| Constant | Value (px) | Meaning |
|----------|------------|---------|
| `SHARE_TOP` | 16 | Share button from safe top |
| `SHARE_SIZE` | 19 | Share icon size |
| `SHARE_TO_QR` | 14 | Gap share → QR |
| `QR_TOP` | 49 | QR top (= SHARE_TOP + SHARE_SIZE + SHARE_TO_QR) |
| `QR_SIZE` | 168 | QR code size |
| `GAP_UNDER_QR` | 18 | Gap QR → card (browse mode) |
| `QR_OVERLAP` | 112 | Card overlaps QR in library mode |
| `CARD_TOP_BROWSE` | 235 | Card top in browse mode |
| `CARD_TOP_LIBRARY` | 123 | Card top in library mode |

### SHEET_INSET

**Browse mode:**
```
left: 20, right: 20, bottom: 18, overlap: 22
```

**Library mode:**
```
left: 14, right: 14, bottom: 14, gap: 10
```

### Helper functions

| Function | Returns |
|----------|---------|
| `safeTop(px)` | `calc(env(safe-area-inset-top) + ${px}px)` |
| `safeBottom(px)` | `calc(env(safe-area-inset-bottom) + ${px}px)` |

---

## Agent Rules

### .cursorrules

Mandatory stack:
- Next.js 16 · React 19 · Tailwind CSS v4 · shadcn/ui · Radix UI · lucide-react · Zustand
- Reuse `src/shared/components/ui/` before creating components
- Add missing shadcn via `npx shadcn@latest add <component>`
- Never hand-roll modals, menus, accessible controls
- Use `cn()` from `@/shared/lib/utils`

### AGENTS.md

- Same stack rules
- Next.js 16 breaking changes — read `node_modules/next/dist/docs/`
- Points to `.cursor/rules/tech-stack.mdc`

### .cursor/rules/tech-stack.mdc

| Layer | Required | Forbidden |
|-------|----------|-----------|
| Framework | Next.js 16 App Router, React 19 | Pages Router, class components |
| Styling | Tailwind v4, oklch CSS vars | CSS modules, styled-components |
| UI | shadcn/ui in shared/components/ui | Custom Button, Modal, Dialog |
| Primitives | Radix via shadcn | Raw div overlays |
| Icons | lucide-react | Custom SVGs |
| State | Zustand | Redux, Context for global |
| Utils | cn() | Ad-hoc class concat |
| IDs | nanoid | Math.random(), uuid |

**Allowed custom:** domain logic, API routes, Zustand slices, gesture hooks, design tokens

**Forbidden:** custom modal/sheet/drawer, dropdown, tabs, form controls, toast system

**Note:** shadcn/Radix NOT actually installed — existing UI is hand-rolled in shared/components/ui/
