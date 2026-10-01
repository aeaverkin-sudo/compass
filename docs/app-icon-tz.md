# ТЗ: иконка приложения ADED

Исходники лежат в репозитории: `docs/brand/app-icon/`. Их НЕ перерисовывать, НЕ сжимать, НЕ скруглять —
только скопировать в нужные места и подключить. Код меняется в двух файлах: `public/manifest.json`
и `src/app/layout.tsx` (если понадобится).

## Дизайн (для понимания, не для реализации)
Сплошной голубой квадрат #CCE6F5, по углам чёрные (#141414) заглавные: A (верх-лево), D (верх-право), E (низ-право), D (низ-лево) — ADED по часовой от левого верхнего угла. Буквы — кривые
внутри файлов, шрифт не нужен. PNG квадратные, без прозрачности и без скругления: iOS/Android
скругляют сами. Скруглить в файле = двойной угол на телефоне.

## 1. Скопировать файлы (git — бинарники как есть)
| Из `docs/brand/app-icon/` | Куда                                   |
|---------------------------|----------------------------------------|
| `apple-icon.png`          | `src/app/apple-icon.png`               |
| `icon-favicon.svg`        | `src/app/icon.svg`                     |
| `favicon.ico`             | `src/app/favicon.ico` (заменить старый)|
| `icon-192.png`            | `public/icons/icon-192.png`            |
| `icon-512.png`            | `public/icons/icon-512.png`            |
| `icon-maskable-512.png`   | `public/icons/icon-maskable-512.png`   |

`icon-1024.png` и `icon.svg` остаются в `docs/brand/app-icon/` как мастер-исходники.

Next.js 16 по именам файлов в `src/app/` сам добавит в `<head>` `<link rel="icon">` (ico + svg) и
`<link rel="apple-touch-icon">`. Руками `<link>` и `metadata.icons` НЕ добавлять.

## 2. `public/manifest.json` — добавить только `icons`, остальное не трогать
```json
"icons": [
  { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
  { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
  { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
]
```

## 3. `src/app/layout.tsx` — в `metadata` добавить
```ts
appleWebApp: { capable: true, title: "ADED", statusBarStyle: "default" },
```
`title`, `manifest`, `viewport` уже правильные — не менять.

## 4. Проверка
1. `npm run build` без ошибок.
2. Открываются: `/apple-icon.png`, `/icon.svg`, `/favicon.ico`, `/manifest.json`, `/icons/icon-512.png`.
3. В `<head>` главной ровно один `apple-touch-icon`, указывает на новый файл.
4. Проверить, что `src/proxy.ts` (middleware) НЕ перехватывает `/apple-icon.png`, `/icon.svg`,
   `/icons/*`, `/manifest.json` (не редиректит на логин). Если matcher их ловит — исключить.
5. Commit `feat: ADED app icon` + push → Render.

## После деплоя (Антон)
iOS не обновляет иконку уже добавленного сайта. Удалить старую с экрана «Домой» → Safari →
«Поделиться» → «На экран Домой».
