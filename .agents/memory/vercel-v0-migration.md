---
name: Vercel/v0 project migration into pnpm-workspace artifacts
description: Checklist item that's easy to miss when porting an imported Next.js/v0 prototype into a Vite artifact in this stack.
---

When migrating an imported Vercel/v0 (Next.js) project's source files into a
Vite-based artifact in the pnpm-workspace stack, copying over `pages/`,
`components/`, `lib/`, etc. is not sufficient. The artifact scaffold's
`src/App.tsx` starts as a placeholder ("Replit Agent is building..." with only
a `/` route and a catch-all NotFound). It is easy to leave this untouched while
focusing on typecheck/backend/codegen work — the app will build and serve a
valid 200 response, so curl/log checks won't catch it, but the browser only
ever shows the scaffold placeholder.

**Why:** lost significant time in a migration because all backend/typecheck
signals looked healthy while the frontend router was never rewired to the
real pages — only caught via an actual browser-driven e2e test, not curl or
console log inspection.

**How to apply:** After copying real page/layout/lib source into a Vite
artifact, always explicitly inspect and rewrite `src/App.tsx` to import and
route to the real pages/layout (cross-check exact route paths against the
nav/sidebar/topbar components, not just page filenames), then verify with an
actual browser-based e2e test — server-response checks alone are not enough
to catch a stale router.
