# Compass — MVP

Персональное портфолио и professional networking. Не QR-визитка, а экосистема для identity, бизнеса и конференций.

## Структура проекта

```
src/
├── app/                    # Next.js маршруты (страницы)
├── features/               # Модули по функциям
│   ├── portfolio/          # Портфолио, QR, inline-edit, слоты
│   ├── people/             # Полученные / переданные контакты
│   ├── events/             # Event Space, конференции
│   ├── matching/           # Professional matching (demo)
│   ├── analytics/          # Analytics (demo)
│   ├── ai/                 # AI Summary, voice notes (demo)
│   ├── subscription/       # Тарифы и лимиты
│   └── exchange/           # Share, onboarding, сохранение
└── shared/                 # UI, store, types, constants
```

## Запуск для друзей (без домена)

Проект не работает «сам по себе» на вашем Mac — нужен публичный URL на Render (бесплатно). Инструкция ниже в разделе **Деплой на Render**.

---

## Установка на iPhone (PWA)

1. Задеплойте проект на Render и скопируйте URL вида `https://compass-xxxx.onrender.com`
2. На iPhone откройте этот URL в **Safari** (не Chrome)
3. Нажмите кнопку **«Поделиться»** (квадрат со стрелкой вверх)
4. Прокрутите вниз → **«На экран Домой»**
5. Нажмите **«Добавить»**

Приложение появится как иконка на домашнем экране.

---

## Деплой на Render (бесплатно)

### Шаг 1 — GitHub

1. Создайте репозиторий на GitHub: https://github.com/new
2. Назовите, например: `compass`
3. В терминале:

```bash
cd /Users/antonaverkin/Documents/Cursor/compass
git add -A
git commit -m "Compass MVP"
git remote add origin https://github.com/ВАШ_ЛОГИН/compass.git
git push -u origin main
```

### Шаг 2 — Render

1. Зайдите на https://render.com и войдите через GitHub
2. Нажмите **New +** → **Web Service**
3. Выберите репозиторий `compass`
4. Настройки:
   - **Runtime:** Node
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Plan:** Free
5. Нажмите **Create Web Service**
6. Дождитесь деплоя (~3–5 минут)
7. Скопируйте URL вида `https://compass-xxxx.onrender.com`

### Шаг 3 — Поделиться с друзьями

Отправьте им URL. Они открывают в Safari → «На экран Домой».

---

## Как тестировать MVP

### Создание портфолио

1. Откройте приложение → введите имя → **Создать профиль**
2. Вкладка **Portfolio** (нижнее меню)
3. Нажмите на имя / описание / фото — редактируется inline
4. Внизу — **универсальные строки**. Нажмите строку → выберите тип (ссылка, PDF, фото, текст)
5. Кнопка **«Добавить»** на строке — мгновенно включает материал в карточку и QR

### Несколько портфолио

- Кнопка **+** справа вверху — новое портфолио
- Точки под заголовком — переключение
- Свайп влево/вправо по карточке

### Share и QR

- **Share** — отправить ссылку через мессенджер / email
- **QR** — показать другому человеку для сканирования
- Получатель открывает ссылку → **Сохранить как Person**

### People

- **Полученные** — кто передал вам портфолио
- **Переданные** — кому вы передали
- **Добавить demo-контакт** — для теста без второго телефона
- Откройте контакт → заметки, selfie, AI Summary, voice note

### Events

- Коды для теста: **WS2026** или **SLUSH26**
- Event Space → matching, batch summary, organizer analytics (demo)

### Matching

- Вкладка **Match** → опишите запрос → demo-результаты

### Тарифы

- **More (Settings)** → смените тариф Free / Business / Professional / Conference
- Лимиты портфолио и строк меняются сразу

---

## Что работает реально

- Создание профиля и портфолио
- Inline editing
- Универсальные строки (ссылка, PDF, фото, текст)
- Мгновенное добавление в карточку
- QR + Share через API
- Сохранение полученного портфолио
- People (received / sent)
- Заметки, selfie, Event Space
- Тарифные лимиты

## Что пока demo (заглушки)

- AI Summary
- Voice transcription
- Matching engine
- Analytics dashboards
- Organizer analytics

---

## Следующие шаги

1. Подключить базу данных (PostgreSQL на Render)
2. Интегрировать ваш код matching из другого проекта
3. Подключить OpenAI для AI Summary и transcription
4. Auth (логин через email / Google)

---

## Локальная разработка (только для вас, не для друзей)

```bash
npm install
npm run dev
```

После работы остановите сервер: `Ctrl+C` в терминале. Пока `npm run dev` запущен — проект «висит» на вашем Mac.
