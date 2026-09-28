import cors from "cors";
import express from "express";

import {
  forgotPasswordHandler,
  loginHandler,
  registerHandler,
  resendOtpHandler,
  resetPasswordHandler,
  verifyOtpHandler,
} from "./auth/auth.controller.js";
import { AuthHttpError } from "./auth/auth.types.js";
import { assertSupabaseConfig, config } from "./config.js";
import { rateLimit } from "./http.js";
import { ingestReadingsHandler } from "./ingestion/ingestion.controller.js";
import { MAX_INGESTION_JSON_BYTES } from "./ingestion/ingestion.limits.js";

try {
  assertSupabaseConfig();
} catch (error) {
  const message = error instanceof AuthHttpError ? error.message : "Invalid Supabase configuration.";
  console.error(`[auth] startup aborted: ${message}`);
  process.exit(1);
}

const MINUTE = 60_000;
const DEV_BROWSER_ORIGINS = [
  "http://localhost:8081",
  "http://127.0.0.1:8081",
  "http://localhost:19006",
  "http://127.0.0.1:19006",
];

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) {
    return true;
  }
  if (config.corsOrigins.includes(origin)) {
    return true;
  }
  return process.env.NODE_ENV !== "production" && config.corsOrigins.length === 0
    ? DEV_BROWSER_ORIGINS.includes(origin)
    : false;
}

const app = express();

app.use(
  cors({
    origin(origin, callback) {
      callback(null, isAllowedOrigin(origin));
    },
  }),
);
app.use(express.json({ limit: MAX_INGESTION_JSON_BYTES }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "tracepay-auth" });
});

app.post("/auth/register", rateLimit("register", 5, 15 * MINUTE), (req, res) => {
  void registerHandler(req, res);
});
app.post("/auth/login", rateLimit("login", 10, 10 * MINUTE), (req, res) => {
  void loginHandler(req, res);
});
app.post("/auth/verify-otp", rateLimit("verify-otp", 15, 10 * MINUTE, true), (req, res) => {
  void verifyOtpHandler(req, res);
});
app.post("/auth/resend-otp", rateLimit("resend-otp", 5, 15 * MINUTE, true), (req, res) => {
  void resendOtpHandler(req, res);
});
app.post("/auth/forgot-password", rateLimit("forgot-password", 5, 15 * MINUTE, true), (req, res) => {
  void forgotPasswordHandler(req, res);
});
app.post("/auth/reset-password", rateLimit("reset-password", 10, 10 * MINUTE, true), (req, res) => {
  void resetPasswordHandler(req, res);
});

app.post("/ingestion/readings", rateLimit("ingestion", 20, 10 * MINUTE), (req, res) => {
  void ingestReadingsHandler(req, res);
});

app.listen(config.port, "0.0.0.0", () => {
  const sms = config.twilioVerifyServiceSid
    ? "verify"
    : config.authAllowOtpFallback && config.twilioFrom
      ? "otp-fallback"
      : "missing";
  console.log(`TRACEPAY auth listening on 0.0.0.0:${config.port} (sms: ${sms})`);
});
