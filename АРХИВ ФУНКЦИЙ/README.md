# АРХИВ ФУНКЦИЙ — Compass (Addet.)

> **Дата архива:** 18 сентября 2026  
> **Назначение:** сохранить всё, что было реализовано, перед полным перезапуском проекта.  
> **Стек:** Next.js 16 · React 19 · Tailwind CSS v4 · Zustand · lucide-react · qrcode.react · pdf-lib · nanoid

---

## Содержание

| Файл | Описание |
|------|----------|
| [ЛОГИКА-И-МЕХАНИКА.md](./ЛОГИКА-И-МЕХАНИКА.md) | **Главный документ** — поведение, состояния, жесты, модель данных, правила UX |
| [01-ЭКРАНЫ-И-МАРШРУТЫ.md](./01-ЭКРАНЫ-И-МАРШРУТЫ.md) | Все страницы приложения и их назначение |
| [02-ФУНКЦИИ-И-СЕРВИСЫ.md](./02-ФУНКЦИИ-И-СЕРВИСЫ.md) | Все функции, компоненты и сервисы с описаниями |
| [03-STORE-И-TYPES.md](./03-STORE-И-TYPES.md) | Zustand store, actions, типы данных |
| [04-API-И-SHARE.md](./04-API-И-SHARE.md) | API маршруты, шаринг, QR, PDF |
| [05-HOOKS-И-UI.md](./05-HOOKS-И-UI.md) | Хуки, общие UI-компоненты, layout |
| [06-ДИЗАЙН-ТОКЕНЫ.md](./06-ДИЗАЙН-ТОКЕНЫ.md) | CSS-переменные, layout-константы, классы |
| [07-LEGACY.md](./07-LEGACY.md) | Устаревший код (не используется, но остался в репо) |
| [08-ДЕМО-И-МОКИ.md](./08-ДЕМО-И-МОКИ.md) | Что работает по-настоящему vs что заглушка |
| [09-СПЕЦИФИКАЦИЯ-UI.md](./09-СПЕЦИФИКАЦИЯ-UI.md) | Целевой дизайн из макетов (эталон для перезапуска) |
| [исходники-логики/](./исходники-логики/) | **Копии исходников** — contact-item, store, types, hooks (переносить при перезапуске) |

---

## Краткая карта продукта

**Compass** — мобильное PWA для обмена цифровыми визитками на ивентах.

### Реально работает
- Редактор карточки (имя, фото, title, chips)
- Глобальная библиотека контактов + привязка к карточкам
- QR-код → публичная share-страница
- Share API (in-memory токены)
- PDF-экспорт карточки
- CRM контактов (People)
- Заметки, selfie, контекст встречи
- Next Scan — одноразовые дополнения при сканировании
- Tier limits (free/business/professional/conference)
- PWA install

### Демо / заглушки
- AI Summary, Voice transcription
- Matching engine
- Analytics dashboards
- Organizer analytics
- Batch AI summary

---

## Модель данных (v3)

```
contactItems[]     ← глобальная библиотека (все строки контактов)
cards[]            ← карточки, каждая ссылается на contactItemIds[]
currentCardIndex   ← активная карточка
people[]           ← CRM
events[]           ← ивент-пространства
user               ← tier, onboarded
```

Persist key: `compass-storage-v3` (localStorage)

---

## Ключевые файлы исходного кода

```
src/features/portfolio/
  components/portfolio-screen.tsx    — оркестратор главного экрана
  components/portfolio-stack.tsx     — layout: QR + card + library
  components/business-card.tsx       — визитка
  components/library-panel.tsx       — библиотека контактов
  components/qr-zone.tsx             — QR-код
  services/contact-item.ts           — детекция типов, группировка, snapshot
  services/messenger-parse.ts        — Telegram, WhatsApp
  services/portfolio-pdf.ts          — PDF export
  constants/layout.ts                — pixel-константы из макета

src/shared/store/app-store.ts        — Zustand store
src/shared/types/index.ts            — все типы
src/app/api/share/                   — share API
```

---

## Как использовать этот архив

1. **Перед перезапуском** — прочитать `ЛОГИКА-И-МЕХАНИКА.md` — там вся бизнес-логика текстом
2. **При реализации элемента** — смотреть `09-СПЕЦИФИКАЦИЯ-UI.md` + соответствующий раздел в `02-ФУНКЦИИ-И-СЕРВИСЫ.md`
3. **При переносе логики** — копировать функции из `services/contact-item.ts`, `messenger-parse.ts` (они не зависят от UI)
4. **Не переносить** — layout-код из `portfolio-stack.tsx` (дизайн признан неудачным)

---

## Примечание о дизайне

Текущая реализация UI **не соответствует макетам** и признана неудачной. Архив сохраняет **логику и функции**, но **не layout-код** как эталон. Перезапуск — по одному элементу за раз, сверяясь с `09-СПЕЦИФИКАЦИЯ-UI.md`.
