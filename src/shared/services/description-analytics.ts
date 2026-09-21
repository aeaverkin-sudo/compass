export type DescriptionTone = "professional" | "lifestyle" | "neutral";

/** English-only — shown in docs and used to classify Description rows. */
export const PROFESSIONAL_DESCRIPTION_KEYWORDS = [
  "ceo",
  "cto",
  "cfo",
  "coo",
  "vp",
  "founder",
  "co-founder",
  "cofounder",
  "director",
  "manager",
  "lead",
  "head of",
  "president",
  "partner",
  "engineer",
  "developer",
  "designer",
  "architect",
  "consultant",
  "analyst",
  "startup",
  "company",
  "saas",
  "b2b",
  "b2c",
  "platform",
  "product",
  "we build",
  "founded",
  "venture",
  "enterprise",
  "software",
  "agency",
  "studio",
  "years of experience",
  "year of experience",
  "experienced",
  "specialize",
  "specialist",
  "specializing",
  "specialization",
  "expertise",
  "expert in",
] as const;

const LIFESTYLE_KEYWORDS = [
  "love",
  "living in",
  "based in",
  "dad",
  "mom",
  "father",
  "mother",
  "husband",
  "wife",
  "dog",
  "cat",
  "pet",
  "travel",
  "coffee",
  "wine",
  "foodie",
  "fitness",
  "gym",
  "yoga",
  "running",
  "surfer",
  "vibes",
  "blessed",
  "grateful",
  "enjoy",
  "fan of",
  "hobby",
  "hobbies",
  "lifestyle",
] as const;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function keywordPattern(keyword: string): RegExp {
  const escaped = escapeRegExp(keyword);
  if (keyword.includes(" ")) return new RegExp(escaped, "i");
  return new RegExp(`\\b${escaped}`, "i");
}

const PROFESSIONAL = PROFESSIONAL_DESCRIPTION_KEYWORDS.map(keywordPattern);
const LIFESTYLE = LIFESTYLE_KEYWORDS.map(keywordPattern);

function scorePatterns(text: string, patterns: RegExp[]) {
  return patterns.reduce((score, pattern) => (pattern.test(text) ? score + 1 : score), 0);
}

/** Heuristic tone for Description rows — no network, runs on every sort. */
export function classifyDescription(raw: string): DescriptionTone {
  const text = raw.trim();
  if (!text) return "neutral";

  const professional = scorePatterns(text, PROFESSIONAL);
  const lifestyle = scorePatterns(text, LIFESTYLE);

  if (lifestyle > professional && lifestyle > 0) return "lifestyle";
  if (professional > 0) return "professional";
  return "neutral";
}
