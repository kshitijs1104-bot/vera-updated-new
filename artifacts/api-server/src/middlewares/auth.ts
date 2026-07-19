import type { NextFunction, Request, Response } from "express";
import { clerkMiddleware, getAuth } from "@clerk/express";
import { logger } from "../lib/logger";

// This file replaces the old `(req.headers["x-session-id"] as string) || req.ip
// || "default"` pattern that every /ai/* route used for identity. That pattern
// was never real identity — req.ip changes across NAT/mobile-network/VPN
// hops, and two people behind the same IP (same office wifi, same campus)
// silently shared a "session": each other's decision history, roadmap cards,
// and (once built) Goal state. x-session-id was sent by exactly one frontend
// file (ArticleDrawer.tsx) and never by Venus.tsx itself, so in practice the
// header was almost always absent and every Venus user fell through to IP.
//
// clerkMiddleware() reads the session token from the Authorization header
// (or __session cookie) on every request and, if present and valid, attaches
// auth info to the request via getAuth(req). It does NOT reject unauthenticated
// requests by itself — that's what requireAuth below is for. Mounting
// clerkMiddleware globally (see app.ts) is what makes getAuth(req) available
// everywhere, including public routes that want to optionally recognize a
// signed-in user without requiring it.
export { clerkMiddleware };

// Route guard for anything that needs a real, verified user — this is what
// /ai/* and future /goals endpoints should use instead of the old inline
// sessionId fallback line. Responds 401 if there's no valid Clerk session
// rather than silently degrading to an IP-derived identity.
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req);
  if (!auth?.userId) {
    logger.warn({ path: req.path }, "Rejected request with no verified Clerk session");
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

// Convenience accessor so route handlers can do `const userId = requireUserId(req)`
// instead of re-deriving it. Only safe to call after requireAuth has run
// (i.e. inside a route mounted behind it) — throws otherwise so a missing
// requireAuth() on some future route fails loudly in dev instead of quietly
// resolving to undefined and re-opening the IP-fallback-style bug this file
// exists to close.
export function requireUserId(req: Request): string {
  const auth = getAuth(req);
  if (!auth?.userId) {
    throw new Error(
      "requireUserId() called on a request with no verified session — this route is missing the requireAuth middleware.",
    );
  }
  return auth.userId;
}
