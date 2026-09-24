# Compass — Storage & Backend Spec (Card / Attachments / One-Time Transfer)

> Задание для Cursor. Переводит проект с «всё в localStorage + ephemeral Map» на настоящий
> бэкенд: **Supabase Postgres** (данные) + **Supabase Storage** (файлы), приватные по
> умолчанию, доступ наружу — только через серверную проекцию и подписанные ссылки.
>
> Реализует слой хранения из Master ТЗ. UI и UX не переделываются. Существующая
> структура сервисов (`attachment-storage.ts`, `share-store.ts`, `card-pdf.ts`) сохраняется,
> меняется то, куда они пишут и откуда читают.
>
> Стек не расширять сверх необходимого: только `@supabase/supabase-js` + `@supabase/ssr`.
> Никаких новых UI-библиотек — правила из `AGENTS.md` / `.cursorrules` остаются в силе.

---

## 0. Что не так сейчас (контекст, не трогать как есть)

Точная картина текущего кода, чтобы понимать, что заменяем:

- `src/shared/services/attachment-storage.ts` — файлы превращаются в **base64 data URL**
  (`fileToDataUrl`) и хранятся как строки. Ресайз картинок (`resizeImageToDataUrl`) существует
  только чтобы влезть в лимит localStorage (~5 МБ на origin). Это тупик: два-три файла — и запись
  падает, данные теряются.
- `src/shared/store/app-store.ts` — Zustand `persist` в localStorage (`compass-storage-v4`).
  Это **единственный источник правды**. Привязан к одному браузеру на одном устройстве.
- `src/shared/lib/share-store.ts` — `shareStore` это `Map` в памяти Node-процесса
  (`globalThis.__compassShareStore`). На Render **обнуляется при каждом редеплое / холодном старте**
  и не общий между инстансами. Расшаренная карточка отдаёт 404 после ближайшего деплоя.
- `markShareViewed()` — **гонка**: `read → check → set` на обычном Map, без транзакции. Два
  одновременных скана оба получат одноразовый контент. Это ровно то, от чего Master ТЗ требовало
  атомарный consume. Фаза 5 ниже это чинит.
- Аутентификации нет: `user.id` — просто `nanoid()` в localStorage, серверного смысла не имеет.

Что уже сделано правильно и **не переписывать**:
- `card-pdf.ts` — генерация через `pdf-lib` из структурных данных на сервере, без headless-браузера
  (значит без SSRF-риска), собирается заново каждый раз. Оставляем, только меняем источник данных.
- Таксономия типов в `src/shared/types/index.ts` (`ContactType`, `NextScanAddonType`) — уже покрывает
  файловые типы. Переиспользуем как есть.

---

## 1. Owner identity — анонимная сессия

Принцип продукта: человек заходит и сразу делает визитку, **без экрана регистрации**.

- На первом заходе клиент вызывает `supabase.auth.signInAnonymously()`. Полученный `auth.uid()`
  становится владельцем. Никакого экрана логина.
- Текущий `User.id = nanoid()` заменяется на `auth.uid()`. При первом аутентифицированном заходе,
  если в localStorage есть карточка, а на сервере для этого uid ничего нет — **однократно
  заливаем локальные данные на сервер** (миграция local → server), затем источник правды — сервер.
- Позже (не в этой фазе) — опциональная привязка email через `linkIdentity()` с сохранением
  того же `user_id`. Это страховка «не потерять портфолио», а не стена на входе.
- Rate limit на `signInAnonymously` — обязателен (иначе накрутят миллион анонимов). Чистка
  брошенных анонимов без единой опубликованной карточки — фоновая задача (Фаза 6).

Оговорка, зафиксировать в UI-тексте позже: анонимная сессия живёт в хранилище устройства. Чистка
данных браузера до привязки email = потеря доступа к карточке. Поэтому после первой публикации мягко
предлагать привязать email.

---

## 2. Схема Postgres

Именование таблиц и полей — финальное. Типы согласованы с `src/shared/types/index.ts`.

```sql
-- Владелец (аноним или потом привязанный email); id = auth.users.id
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- Файлы: строка-описание, байты лежат в Storage
create table attachments (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references profiles(id) on delete cascade,
  bucket        text not null,            -- 'card-attachments' | 'transfer-assets'
  storage_path  text not null,            -- путь внутри bucket
  mime          text not null,
  byte_size     integer not null,
  original_name text,
  created_at    timestamptz not null default now()
);

-- Карточка. public_token — то, что кодирует QR: /c/{public_token}
create table cards (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references profiles(id) on delete cascade,
  display_name        text not null default '',
  title               text not null default '',
  photo_attachment_id uuid references attachments(id) on delete set null, -- было Card.photo (base64)
  status              text not null default 'draft'
                        check (status in ('draft','published','archived')),
  public_token        text not null unique,       -- ≥16 симв., криптослучайный, не последовательный
  qr_version          integer not null default 1, -- инкремент при осмысленной публикации
  item_order_manual   boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Пункт карточки = текущий ContactItem + visible + привязка к файлу
create table card_items (
  id             uuid primary key default gen_random_uuid(),
  card_id        uuid not null references cards(id) on delete cascade,
  type           text not null,       -- ContactType
  label          text not null default '',
  value          text not null default '',  -- текст/URL; для файловых типов — подпись/пусто
  url            text not null default '',
  attachment_id  uuid references attachments(id) on delete set null, -- для файловых типов
  sort_order     integer not null default 0,
  visible        boolean not null default true,  -- скрытые НЕ уходят в публичную проекцию
  created_at     timestamptz not null default now()
);

-- Одноразовая передача — «for the next scan only». Отдельная сущность, не часть карточки.
create table card_transfers (
  id             uuid primary key default gen_random_uuid(),
  card_id        uuid not null references cards(id) on delete cascade,
  transfer_token text not null unique,     -- /t/{transfer_token}
  status         text not null default 'pending'
                   check (status in ('pending','consumed','expired')),
  consumed_at    timestamptz,
  expires_at     timestamptz not null default (now() + interval '24 hours'),
  created_at     timestamptz not null default now()
);

create table transfer_items (
  id            uuid primary key default gen_random_uuid(),
  transfer_id   uuid not null references card_transfers(id) on delete cascade,
  type          text not null check (type in ('text','voice','selfie')), -- NextScanAddonType
  content       text not null default '',   -- для text; для voice/selfie — пусто
  attachment_id uuid references attachments(id) on delete set null,      -- для voice/selfie
  created_at    timestamptz not null default now()
);

-- Аналитика (лёгкая, приватная; можно отложить на Фазу 6)
create table card_events (
  id         uuid primary key default gen_random_uuid(),
  card_id    uuid references cards(id) on delete cascade,
  type       text not null,  -- card_open|qr_open|transfer_created|transfer_consumed|attachment_open|pdf_generated|share
  created_at timestamptz not null default now()
);

create index on card_items(card_id);
create index on attachments(owner_id);
create index on card_transfers(transfer_token);
create index on cards(public_token);
```

**Соответствие текущим TS-типам** (для миграции стора): `Card.photo` → `photo_attachment_id`;
`Card.contactItemIds[]` + порядок → `card_items.sort_order`; `Card.nextScanAddons[]` → `card_transfers`
+ `transfer_items`; `User.shareToken` → `cards.public_token` (теперь на карточку, не на юзера).
В `src/shared/types/index.ts` добавить в `ContactItem` поля `visible: boolean`, `attachmentId?: string`;
в `Card` — `status`, `publicToken`, `qrVersion`.

---

## 3. Storage (байты файлов)

Два приватных bucket, **публичного доступа нет ни у одного**:

- `card-attachments` (private) — постоянные файлы карточки. Путь: `{owner_id}/{card_id}/{attachment_id}`.
- `transfer-assets` (private) — одноразовые selfie/voice. Путь: `{transfer_id}/{attachment_id}`.
  Удаляются при consume/expire (Фаза 6).

Правила загрузки (сервер, на каждый upload):
1. Проверка реального типа по **magic bytes**, а не по тому, что сказал браузер.
2. Проверка размера по лимиту (таблица ниже).
3. Если картинка — срезать EXIF/GPS.
4. Положить в приватный bucket → создать строку `attachments` → вернуть `attachment_id`.

Лимиты (стартовые, вынести в конфиг):

| Тип | Лимит | Форматы |
|---|---|---|
| Фото карточки / photo-item | 8 МБ | jpeg, png, webp |
| PDF / документ | 15 МБ | pdf, docx, pptx, xlsx |
| Voice note | 10 МБ | m4a, mp3, ogg |
| На аккаунт всего | 500 МБ | — |

Отдача файла наружу — **только по подписанной ссылке** с коротким TTL (5–15 мин), выписываемой
серверным роутом `/f/{attachment_id}` (см. Фаза 3). Никаких вечных публичных URL.

---

## 4. Доступ: RLS + серверная проекция

Два разных пути, не путать:

**Владелец (аутентифицирован)** — прямой доступ к своим строкам через RLS:
```sql
alter table profiles       enable row level security;
alter table cards          enable row level security;
alter table card_items     enable row level security;
alter table attachments    enable row level security;
alter table card_transfers enable row level security;
alter table transfer_items enable row level security;

-- profiles
create policy "own profile" on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

-- cards
create policy "own cards" on cards
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- card_items (через владение карточкой)
create policy "own items" on card_items
  for all using (exists (select 1 from cards c where c.id = card_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from cards c where c.id = card_id and c.owner_id = auth.uid()));

-- attachments
create policy "own attachments" on attachments
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- transfers / transfer_items — аналогично через владение карточкой (см. card_items)
```

**Публика (аноним-зритель по QR)** — **НЕ** даём прямой anon-доступ к таблицам. Никаких anon-policy
на select. Публичное чтение идёт **только** через серверный роут (`/c/{token}`, `/f/{id}`, `/t/{token}`),
который ходит в базу под **service role** и вручную фильтрует. Причина: публичные RLS-policy — самый
частый источник утечек в проектах на Supabase (случайно открыл больше строк/колонок, чем думал).
Серверную проекцию проще аудировать.

Секреты: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — клиент.
`SUPABASE_SERVICE_ROLE_KEY` — **только сервер**, никогда не `NEXT_PUBLIC_`, никогда не уходит на фронт.

---

## 5. Публичные эндпоинты

### `/c/{public_token}` — живая карточка (заменяет ephemeral share)

Серверный роут, service role. Возвращает **только**:
- карточку со `status = 'published'` (иначе 404);
- её `card_items` с `visible = true`, отсортированные по `sort_order`;
- для файловых пунктов — `attachment_id` (сам файл тянется отдельно через `/f/{id}`).

Никогда не отдавать: `owner_id`, скрытые (`visible=false`) пункты, черновики, служебные поля.
Событие `card_open` пишется в `card_events`.

### `/f/{attachment_id}` — резолвер файла

Серверный роут. Проверяет, что файл принадлежит опубликованной карточке и видимому пункту
(или запрашивает сам владелец). Затем `createSignedUrl(storage_path, 600)` (10 мин) и редирект/отдача.
Подпись протухает — доступ закрывается. Замена underlying-файла не ломает ссылку (id стабильный).

### `/t/{transfer_token}` — одноразовая передача (атомарный consume)

Заменяет `nextScanAddons`-в-Map. **Ключевой момент — консистентность гонки.** Consume делается
одним атомарным UPDATE, а не read-check-set:

```sql
update card_transfers
set status = 'consumed', consumed_at = now()
where transfer_token = $1
  and status = 'pending'
  and expires_at > now()
returning id;
```

- Вернулась строка → этот запрос «выиграл»: отдаём `transfer_items` (текст + подписанные ссылки на
  selfie/voice) **вместе** с живой карточкой. Пишем `transfer_consumed`.
- Вернулось 0 строк (уже забрали или протухло) → отдаём **только живую карточку**, без спец-контента.

Так два одновременных скана физически не могут оба получить одноразовый контент — Postgres сериализует
UPDATE по строке. Это и есть фикс бага из `markShareViewed`.

`/c/{token}` **никогда** не отдаёт `transfer_items` — одноразовый контент живёт только на `/t/`.

---

## 6. Миграция текущего кода (по файлам)

- **`src/shared/services/attachment-storage.ts`** — оставить `resizeImageToDataUrl` (ресайз перед
  загрузкой всё ещё полезен для трафика), но заменить выход: вместо возврата data URL в стор — новая
  функция `uploadAttachment(file, type): Promise<{ attachmentId: string }>`, которая грузит (ресайзнутый)
  blob в Supabase Storage и возвращает `attachment_id`. `fileToDataUrl` для хранения больше не
  используется (может остаться для превью до загрузки).
- **`src/shared/store/app-store.ts`** — `persist` в localStorage остаётся, но только как офлайн-кэш /
  черновик. Все мутации (`updateCard`, `addItemToCard`, `updateContactItemAttachment`, `deleteContactItem`,
  …) идут через новый sync-сервис write-through в Supabase. Источник правды — сервер; при загрузке
  гидрируемся с сервера, кэш — фолбэк офлайн.
- **`src/shared/lib/share-store.ts`** — **удалить `Map` целиком**. Заменить на чтение из БД.
- **`src/app/api/share/route.ts` + `[token]/route.ts`** — переписать под Supabase и переименовать в
  `/c/{token}` (публичная проекция) и `/t/{token}` (consume). Публикация карточки = отдельная мутация
  владельца (`status='published'`, `qr_version++`), а не POST снапшота.
- **`src/shared/services/card-pdf.ts`** — почти без изменений; кормить серверными данными. Для
  transfer-снапшота включать `transfer_items` **только** этого получателя. PDF не хранить — генерировать
  на запрос.
- **`src/shared/types/index.ts`** — добавить `visible`, `attachmentId` в `ContactItem`; `status`,
  `publicToken`, `qrVersion` в `Card`.

---

## 7. Фоновые задачи и уборка

- **Orphan-байты**: при удалении `card_item` с файлом / отвязке attachment — удалять объект из Storage,
  а не только строку. Иначе Storage копит мусор (платный) и «удалённый» файл физически остаётся (GDPR).
- **Transfer cleanup**: при `consumed`/`expired` — удалять объекты из `transfer-assets` и строки.
  Плюс cron, помечающий `pending` старше 24ч как `expired` и чистящий их.
- **Анонимы**: чистка `profiles` без единой `published` карточки старше N дней.
- **Картинки**: отдавать наружу через image-transform Supabase (уменьшенные версии), не оригинал 5 МБ
  на каждый скан.
- **PDF**: никогда не кэшировать в Storage.

---

## 8. Порядок для Cursor (отдельная задача на фазу, не всё сразу)

0. **Setup** — Supabase-проект, env-переменные, `@supabase/ssr`-клиент (server + browser),
   `signInAnonymously()` на первом заходе. Проверка: аноним-сессия создаётся, `auth.uid()` доступен.
1. **Схема + RLS** — миграции всех таблиц из §2 и §4. Однократная миграция локальной карточки local→server.
2. **Write-through стор** — CRUD карточки/пунктов в Supabase; localStorage → кэш.
3. **Attachments** — `uploadAttachment` + приватный bucket + `/f/{id}` резолвер; заменить base64 фото/файлы.
4. **Публичная `/c/{token}`** — серверная проекция (service role, только published + visible).
5. **Одноразовая `/t/{token}`** — атомарный consume (§5), подвязать UI «for the next scan only»; убрать
   `nextScanAddons`-в-Map.
6. **PDF + уборка** — PDF из серверных данных (+transfer-снапшот); orphan/expired cleanup; image-transform.

> Каждую фазу — отдельной сессией Cursor: составить implementation plan, показать, потом писать код.
> Не гнать все шесть фаз одним заходом — контекст агента поплывёт.

---

## 9. Приёмка (конкретные тесты, не «работает же»)

- Скрытый пункт (`visible=false`) **не появляется** в JSON-ответе `/c/{token}` (смотреть ответ сети,
  не UI).
- У файла **нет** публичного URL: прямой bucket-URL → 403; работает только подписанная ссылка, и она
  протухает по TTL.
- **Два одновременных** GET `/t/{token}` → ровно один получает `transfer_items`, второй — только живую
  карточку. (Воспроизводит найденный баг.)
- После consume объекты transfer из Storage **удалены**.
- Удаление `card_item` с файлом убирает объект из Storage (нет orphan).
- Очистка данных браузера и перезаход на том же аккаунте — карточка восстанавливается **с сервера**.
- `SUPABASE_SERVICE_ROLE_KEY` не встречается ни в одном `NEXT_PUBLIC_`-переменной и не уходит на клиент
  (grep по бандлу).
```
