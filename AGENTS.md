# Agent rules

## Tech stack — do not reinvent

**Mandatory:** Next.js 16 (App Router) · React 19 · **Tailwind CSS v4** · **shadcn/ui** · **Radix UI** (via shadcn) · lucide-react · Zustand · `cn()` from `@/lib/utils`.

1. Reuse `src/shared/components/ui/` before creating anything new.
2. Missing component → `npx shadcn@latest add <name>` into `src/shared/components/ui/`.
3. **Never** hand-roll modals, dropdowns, tabs, tooltips, or accessible form primitives — use shadcn/Radix.
4. Styling via Tailwind v4 only; `oklch` CSS vars allowed for design-spec screens.
5. Full rule: `.cursor/rules/tech-stack.mdc`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
