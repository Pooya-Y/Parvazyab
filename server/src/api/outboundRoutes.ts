import { Router } from "express";
import { config } from "../config/env";
import { runInBackground } from "../lib/background";
import { CLICK_SOURCES, outboundTarget, recordClick, type ClickSource } from "../services/clicks";
import { uuidParam } from "./schemas";

const router = Router();

/**
 * Every "buy" button goes through here: count the click for the agency's
 * analytics, then hand the traveller over. The agency sees the visit came from
 * Parvazyab (Referrer-Policy: origin) but not which page, and its link is
 * passed on untouched.
 */
router.get("/go/:listingId", async (req, res) => {
  res.set({
    "Cache-Control": "no-store",
    "Referrer-Policy": "origin",
    "X-Robots-Tag": "noindex, nofollow",
  });
  const id = uuidParam.safeParse(req.params.listingId);
  const target = id.success ? await outboundTarget(id.data) : ({ kind: "app", path: "/" } as const);
  if (target.kind === "app") {
    res.redirect(302, new URL(target.path, config.APP_URL).toString());
    return;
  }
  const source: ClickSource = CLICK_SOURCES.includes(req.query.src as ClickSource)
    ? (req.query.src as ClickSource)
    : "other";
  // Counting must never delay or break the hand-over.
  runInBackground("record click", () => recordClick(target.listing, source, req));
  res.redirect(302, target.url);
});

export default router;
