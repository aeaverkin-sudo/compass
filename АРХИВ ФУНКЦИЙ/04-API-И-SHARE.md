# API и Share

## API Routes

### POST /api/share

**Файл:** `src/app/api/share/route.ts`

**Request body:**
```json
{
  "portfolio": CardSnapshot,
  "ownerName": "string (optional)"
}
```

**Response:**
```json
{ "token": "12-char nanoid" }
```

**Поведение:**
- Создаёт 12-char nanoid token
- Сохраняет в in-memory shareStore
- Возвращает token для share URL

---

### GET /api/share/[token]

**Файл:** `src/app/api/share/[token]/route.ts`

**Response:** CardSnapshot (через getSharePayload)

**Поведение:**
- Вызывает `markShareViewed(token)` — increment viewCount, mark nextScanDelivered
- 404 если token не найден
- nextScanAddons включаются только при первом просмотре

---

### GET /api/share/[token]/status

**Файл:** `src/app/api/share/[token]/status/route.ts`

**Response:**
```json
{
  "viewCount": number,
  "nextScanDelivered": boolean
}
```

**Использование:**
- Portfolio screen polling каждые 3 сек
- Когда nextScanDelivered = true → очистка nextScanAddons с карточки

---

## Share Store

**Файл:** `src/shared/lib/share-store.ts`

### ShareEntry
```typescript
{
  portfolio: CardSnapshot;
  ownerName?: string;
  createdAt: string;
  nextScanDelivered?: boolean;
  viewCount: number;
}
```

### shareStore
- Global `Map<string, ShareEntry>`
- **In-memory** — теряется при рестарте сервера

### getSharePayload(entry)
- Если nextScanDelivered = true → strip nextScanAddons из snapshot
- Иначе → включает nextScanAddons

### markShareViewed(token)
- Increment viewCount
- На первом просмотре: nextScanDelivered = true

---

## Share Flow

### 1. Создание / обновление token

```
PortfolioScreen useEffect:
  card/library/addons changed
  → buildCardSnapshot(card, library)
  → POST /api/share { portfolio, ownerName }
  → store token in local state
```

### 2. Share button (header)

```
Tap Share icon
  → Web Share API { url: /share/{token}, title: displayName }
  → fallback: clipboard copy
```

### 3. QR code

```
URL in QR: /share/{token}?pdf=1
  → PDF mode для сканирования
  → ShareView renders with pdf=1 param
```

### 4. Публичная страница

```
GET /share/[token]
  → fetch GET /api/share/[token]
  → markShareViewed (first view)
  → render ShareView

Query params:
  ?print=1  → print-friendly view
  ?pdf=1    → trigger PDF download
```

### 5. Save to People

```
ShareView "Save contact" button
  → addPerson({ direction: "received", ...snapshot fields })
  → redirect /people/[id]
```

### 6. Next Scan delivery

```
First view of share page:
  → markShareViewed → nextScanDelivered = true
  → nextScanAddons included in payload

Portfolio screen polling (3s):
  → GET /api/share/[token]/status
  → if nextScanDelivered: updateCard({ nextScanAddons: [] })
```

---

## PDF Export

**Файл:** `src/features/portfolio/services/portfolio-pdf.ts`

```
downloadPortfolioPdf(snapshot)
  → pdf-lib create document
  → embedPhoto (PNG/JPG from data URL)
  → add text fields: name, title, subtitle, description, location
  → add contact items with icons/labels
  → trigger browser download
```

**Trigger points:**
- ShareView with `?pdf=1` query param
- Manual download button on share page

---

## CardSnapshot Structure

```typescript
{
  label: string;
  displayName: string;
  photo?: string;          // data URL
  title: string;
  subtitle: string;
  description: string;
  location: string;
  items: ContactItem[];    // only filled, linked items
  nextScanAddons?: NextScanAddon[];  // only if not yet delivered
}
```

Built by: `buildCardSnapshot(card, library)` in contact-item.ts
