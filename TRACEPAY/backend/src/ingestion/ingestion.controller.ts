import type { Request, Response } from "express";

import { AuthHttpError } from "../auth/auth.types.js";
import { authenticateUser, ingestReadings } from "./ingestion.service.js";

function handleError(error: unknown, res: Response): void {
  if (error instanceof AuthHttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }

  console.error("[ingestion]", error);
  res.status(500).json({ error: "Something went wrong. Please try again." });
}

export async function ingestReadingsHandler(req: Request, res: Response): Promise<void> {
  try {
    const userId = await authenticateUser(req.header("authorization"));
    const result = await ingestReadings(userId, req.body);
    res.status(202).json(result);
  } catch (error) {
    handleError(error, res);
  }
}
