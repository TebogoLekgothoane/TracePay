import type { Request, Response } from "express";

import {
  forgotPassword,
  login,
  register,
  resendOtp,
  resetPassword,
  verifyOtp,
} from "./auth.service.js";
import { handleRouteError } from "../http.js";

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export async function registerHandler(req: Request, res: Response): Promise<void> {
  try {
    await register({
      fullName: readString(req.body?.fullName),
      phone: readString(req.body?.phone),
      password: readString(req.body?.password),
    });
    res.status(201).json({ ok: true });
  } catch (error) {
    handleRouteError(error, res, "auth");
  }
}

export async function loginHandler(req: Request, res: Response): Promise<void> {
  try {
    const result = await login({
      phone: readString(req.body?.phone),
      password: readString(req.body?.password),
    });
    res.status(200).json(result);
  } catch (error) {
    handleRouteError(error, res, "auth");
  }
}

export async function verifyOtpHandler(req: Request, res: Response): Promise<void> {
  try {
    const password = readString(req.body?.password);
    const purpose = readString(req.body?.purpose);
    const result = await verifyOtp({
      phone: readString(req.body?.phone),
      code: readString(req.body?.code),
      password: password.length > 0 ? password : undefined,
      purpose: purpose === "reset" ? "reset" : undefined,
    });
    res.status(200).json(result);
  } catch (error) {
    handleRouteError(error, res, "auth");
  }
}

export async function forgotPasswordHandler(req: Request, res: Response): Promise<void> {
  try {
    await forgotPassword(readString(req.body?.phone));
    res.status(200).json({ ok: true });
  } catch (error) {
    handleRouteError(error, res, "auth");
  }
}

export async function resetPasswordHandler(req: Request, res: Response): Promise<void> {
  try {
    const result = await resetPassword({
      phone: readString(req.body?.phone),
      password: readString(req.body?.password),
      resetToken: readString(req.body?.resetToken),
    });
    res.status(200).json(result);
  } catch (error) {
    handleRouteError(error, res, "auth");
  }
}

export async function resendOtpHandler(req: Request, res: Response): Promise<void> {
  try {
    await resendOtp(readString(req.body?.phone));
    res.status(200).json({ ok: true });
  } catch (error) {
    handleRouteError(error, res, "auth");
  }
}
