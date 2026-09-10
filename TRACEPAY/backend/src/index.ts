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
import { config } from "./config.js";
import { ingestReadingsHandler } from "./ingestion/ingestion.controller.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "32kb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "tracepay-auth" });
});

app.post("/auth/register", (req, res) => {
  void registerHandler(req, res);
});
app.post("/auth/login", (req, res) => {
  void loginHandler(req, res);
});
app.post("/auth/verify-otp", (req, res) => {
  void verifyOtpHandler(req, res);
});
app.post("/auth/resend-otp", (req, res) => {
  void resendOtpHandler(req, res);
});
app.post("/auth/forgot-password", (req, res) => {
  void forgotPasswordHandler(req, res);
});
app.post("/auth/reset-password", (req, res) => {
  void resetPasswordHandler(req, res);
});

app.post("/ingestion/readings", (req, res) => {
  void ingestReadingsHandler(req, res);
});

app.listen(config.port, "0.0.0.0", () => {
  const sms = config.twilioVerifyServiceSid
    ? "verify"
    : config.twilioFrom
      ? "from-number"
      : "missing";
  console.log(`TRACEPAY auth listening on 0.0.0.0:${config.port} (sms: ${sms})`);
});
