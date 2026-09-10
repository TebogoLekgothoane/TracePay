import type { Request, Response } from "express";

import {
  forgotPassword,
  login,
  register,
  resendOtp,
  resetPassword,
  verifyOtp,
} from "./auth.service.js";
import { AuthHttpError } from "./auth.types.js";

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function handleError(error: unknown, res: Response): void {
  if (error instanceof AuthHttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }

  console.error("[auth]", error);
  res.status(500).json({ error: "Something went wrong. Please try again." });
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
    handleError(error, res);
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
    handleError(error, res);
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
    handleError(error, res);
  }
}

export async function forgotPasswordHandler(req: Request, res: Response): Promise<void> {
  try {
    await forgotPassword(readString(req.body?.phone));
    res.status(200).json({ ok: true });
  } catch (error) {
    handleError(error, res);
  }
}

export async function resetPasswordHandler(req: Request, res: Response): Promise<void> {
  try {
    const result = await resetPassword({
      phone: readString(req.body?.phone),
      password: readString(req.body?.password),
    });
    res.status(200).json(result);
  } catch (error) {
    handleError(error, res);
  }
}

export async function resendOtpHandler(req: Request, res: Response): Promise<void> {
  try {
    await resendOtp(readString(req.body?.phone));
    res.status(200).json({ ok: true });
  } catch (error) {
    handleError(error, res);
  }
}
