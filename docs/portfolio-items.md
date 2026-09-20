# Portfolio items — Compass card catalog

Compass cards cover **people**, **companies**, **startups**, and **SMBs**. Each row in the library gets an automatic left label from typed text or attached files.

## Identity & text

| Label | Type | Examples |
|-------|------|----------|
| **Description** | `text` | Founder & CEO at Aded · B2B SaaS for logistics · Design studio, Milan |

Free text only when the value is **not** a standalone URL, email, or phone.

## Contact

| Label | Examples |
|-------|----------|
| **Email** | hello@company.com |
| **Phone** | +1 415 555 0100 |
| **WhatsApp** | wa.me/… or phone number |
| **Telegram** | t.me/handle · @handle |

## Social & presence

| Label | Typical use |
|-------|-------------|
| **Instagram** | Personal / brand |
| **LinkedIn** | Person or company page |
| **Meta** | Facebook page |
| **X** | Founder or product account |
| **YouTube** | Channel or demo |
| **TikTok** | Brand |
| **GitHub** | Open source / dev team |
| **Behance** / **Dribbble** | Design portfolio |
| **Spotify** | Podcast / audio show |

## Product & business links

| Label | Examples |
|-------|----------|
| **Link** | company.com · landing page |
| **Calendly** | Booking link |
| **App Store** / **Google Play** | Mobile app |

## Files & media (attachments via **+**)

| Label | Formats | Typical for |
|-------|---------|-------------|
| **Pitch Deck** / **PDF** | `.pdf` | Startup deck, brochure, CV, catalog, price list, case study |
| **Presentation** | `.ppt`, `.pptx`, `.key` | Investor or product overview |
| **Document** | `.doc`, `.docx`, `.txt`, `.rtf` | Profile, press release |
| **Spreadsheet** | `.xls`, `.xlsx`, `.csv` | Pricing, SKU list |
| **Photo** | JPEG, PNG, HEIC, WebP, SVG | Logo, product, team, certificate |
| **Audio** | MP3, M4A, WAV | Podcast clip, voice intro |
| **Video** | MP4, MOV | Short product / founder demo |

Filename hints map to richer labels: `pitch-deck.pdf` → **Pitch Deck**, `resume.pdf` → **CV**, `logo.png` → **Logo**, etc.

## Limits (generous, not unlimited)

Stored locally in the PWA (localStorage). Limits protect performance on phone.

| Rule | Limit |
|------|-------|
| Rows per card (library) | **24** |
| Items on card / QR | **12** |
| Attachments per card | **8** |
| Total attachment storage per card | **15 MB** |
| Text / description length | **2 000** characters |
| Card avatar (separate) | **512 KB**, max **512 px** |

### Per-file ceilings

| Type | Max size |
|------|----------|
| PDF | 8 MB |
| Photo | 4 MB (compressed to max 2048 px) |
| Presentation | 10 MB |
| Document | 5 MB |
| Spreadsheet | 5 MB |
| Audio | 8 MB |
| Video | 15 MB |

**Not supported:** archives (`.zip`), executables, unlimited cloud storage. Attachments are embedded as data URLs until server sync exists.

## Code references

- Catalog & detection: `src/shared/services/portfolio-catalog.ts`
- Limits & validation: `src/shared/services/portfolio-limits.ts`
- Row normalization: `src/shared/services/contact-item.ts`
