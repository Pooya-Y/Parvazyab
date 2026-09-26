import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import router from "./api/router";
import { allowedOrigins } from "./config/env";
import { errorHandler } from "./http/errors";

export function createApp() {
  const app = express();
  // Exactly one reverse proxy (nginx) sits in front in production.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use(
    "/api",
    rateLimit({
      windowMs: 60 * 1000,
      limit: 300,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { error: "RATE_LIMITED" },
    }),
  );
  app.use("/api", router);
  app.use(errorHandler);
  return app;
}
