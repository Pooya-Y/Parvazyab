import { Router } from "express";
import rateLimit from "express-rate-limit";
import { currentUser, requireUser, sessionUser } from "../auth/auth";
import {
  agencyIdBySlug,
  agencyProfile,
  deleteMyReview,
  listAgencies,
  listReviews,
  myReview,
  upsertReview,
} from "../services/agencies";
import { reviewSchema, reviewsQuerySchema, slugParam } from "./schemas";

/** `/api/agencies`: public agency profiles and their reviews. */
const router = Router();

/** Writing reviews is cheap to abuse; editing your own a few times is plenty. */
const reviewWriteLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "RATE_LIMITED" },
});

router.get("/", async (_req, res) => {
  res.json(await listAgencies());
});

router.get("/:slug", async (req, res) => {
  res.json(await agencyProfile(slugParam.parse(req.params.slug)));
});

/** Published reviews, newest first, plus the viewer's own (which may be hidden by moderation). */
router.get("/:slug/reviews", async (req, res) => {
  const agencyId = await agencyIdBySlug(slugParam.parse(req.params.slug));
  const { limit, before } = reviewsQuerySchema.parse(req.query);
  const viewer = await currentUser(req);
  const [items, mine] = await Promise.all([
    listReviews(agencyId, { limit, before, viewerId: viewer?.id }),
    viewer ? myReview(agencyId, viewer.id) : null,
  ]);
  res.json({ items, mine });
});

router.put("/:slug/reviews/mine", requireUser, reviewWriteLimiter, async (req, res) => {
  const agencyId = await agencyIdBySlug(slugParam.parse(req.params.slug));
  res.json(await upsertReview(sessionUser(res), agencyId, reviewSchema.parse(req.body)));
});

router.delete("/:slug/reviews/mine", requireUser, async (req, res) => {
  const agencyId = await agencyIdBySlug(slugParam.parse(req.params.slug));
  await deleteMyReview(sessionUser(res), agencyId);
  res.status(204).end();
});

export default router;
