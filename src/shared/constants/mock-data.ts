import type { EventSpace, MatchingProfile, PortfolioAnalytics } from "@/shared/types";

export const DEMO_EVENTS: Omit<EventSpace, "joinedAt">[] = [
  {
    id: "evt-web-summit",
    name: "Web Summit",
    code: "WS2026",
    location: "Lisbon, Portugal",
    startDate: "2026-11-10",
    endDate: "2026-11-13",
    activeUntil: "2026-11-27",
  },
  {
    id: "evt-slush",
    name: "Slush",
    code: "SLUSH26",
    location: "Helsinki, Finland",
    startDate: "2026-11-19",
    endDate: "2026-11-20",
    activeUntil: "2026-12-04",
  },
];

export const MOCK_MATCHING_PROFILES: MatchingProfile[] = [
  {
    id: "mp-1",
    name: "Sarah Chen",
    headline: "Seed investor · Consumer marketplaces",
    relevance: 94,
    reason: "Ищет early-stage European consumer projects — совпадает с вашим запросом.",
    location: "Lisbon",
    tags: ["Investor", "Marketplace", "Seed"],
  },
  {
    id: "mp-2",
    name: "Marcus Weber",
    headline: "CTO · Fintech scale-ups",
    relevance: 87,
    reason: "Опыт CTO в marketplace-стартапах, открыт к founder-ролям.",
    location: "Berlin",
    tags: ["CTO", "Fintech", "Technical"],
  },
  {
    id: "mp-3",
    name: "Elena Rodriguez",
    headline: "Distribution partner · EU retail",
    relevance: 81,
    reason: "Ищет consumer products для EU distribution — релевантно вашему проекту.",
    location: "Madrid",
    tags: ["Partnership", "Retail", "EU"],
  },
  {
    id: "mp-4",
    name: "James Okonkwo",
    headline: "Angel investor · B2B SaaS",
    relevance: 76,
    reason: "Активный angel с фокусом на B2B — частичное совпадение по стадии.",
    location: "London",
    tags: ["Angel", "B2B", "SaaS"],
  },
];

export const MOCK_ANALYTICS: PortfolioAnalytics[] = [
  {
    portfolioId: "default",
    portfolioName: "Personal",
    opened: 147,
    linksOpened: 63,
    pitchDeck: 28,
    website: 17,
    instagram: 11,
  },
];

export const MOCK_AI_SUMMARY = `**James Morrison** — founder и CEO marketplace-стартапа в сфере consumer goods.

**Опыт:** 8 лет в e-commerce, ранее product lead в крупном ритейлере. Запустил 2 проекта, текущий — на seed-стадии.

**Проекты:** Consumer marketplace с фокусом на sustainable brands. Активно ищет seed-инвесторов и distribution partners в EU.

**Релевантность:** Высокая — совпадает по стадии, географии и типу партнёрства.

**Важно знать:** Говорил про expansion в Iberia. Планирует отправить pitch deck на следующей неделе.`;

export const MOCK_BATCH_SUMMARY = `# Web Summit — 23 контакта

## Ключевые категории
- **Investors:** 7 человек (seed и pre-seed)
- **Founders:** 9 человек (marketplace, SaaS, fintech)
- **Partners:** 4 человека (distribution, retail)
- **Specialists:** 3 человека (CTO, design, marketing)

## Топ-3 для follow-up
1. **Sarah Chen** — seed investor, consumer focus
2. **Marcus Weber** — потенциальный CTO advisor
3. **Elena Rodriguez** — EU distribution

## Рекомендации
- Отправить pitch deck 5 инвесторам до пятницы
- Назначить call с Marcus Weber
- Подготовить one-pager для Elena Rodriguez`;

export const MOCK_VOICE_TRANSCRIPTION =
  "James, investor, говорил про marketplaces. Заинтересовался проектом. На следующей неделе отправить презентацию.";

export const MOCK_ORGANIZER_ANALYTICS = {
  participantsActivated: 1247,
  exchanges: 3891,
  portfoliosShared: 4523,
  uniqueInteractions: 2104,
  investors: 312,
  founders: 891,
  matchingInteractions: 1567,
  postEventFollowUps: 423,
  positiveOutcomes: 89,
};
