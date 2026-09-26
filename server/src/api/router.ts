import { Router } from "express";
import { AppDataSource } from "../database/dataSource";
import { cacheStatus } from "../services/redis";
import { apiNotFound } from "../http/errors";
import searchRoutes from "./searchRoutes";
import authRoutes from "./authRoutes";
import accountSettingsRoutes from "./accountSettingsRoutes";
import { alertRoutes, notificationRoutes } from "./alertRoutes";
import outboundRoutes from "./outboundRoutes";
import v1Routes from "./v1Routes";
import { adminRoutes, dashboardRoutes, savedFlightRoutes } from "./accountRoutes";

const router = Router();

/** Readiness: the API is useless without the database; Redis is optional. */
router.get("/health", async (_req, res) => {
  let db: "up" | "down" = "down";
  try {
    if (AppDataSource.isInitialized) {
      await AppDataSource.query("SELECT 1");
      db = "up";
    }
  } catch {
    // reported below
  }
  res.status(db === "up" ? 200 : 503).json({ ok: db === "up", db, cache: cacheStatus() });
});

router.use("/", searchRoutes);
router.use("/", outboundRoutes);
router.use("/v1", v1Routes);
router.use("/auth", authRoutes);
router.use("/account", accountSettingsRoutes);
router.use("/alerts", alertRoutes);
router.use("/notifications", notificationRoutes);
router.use("/saved-flights", savedFlightRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/admin", adminRoutes);
router.use(apiNotFound);

export default router;
