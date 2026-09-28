import type { Request, Response } from "express";

import { AuthHttpError } from "../auth/auth.types.js";
import { allowRequest, handleRouteError } from "../http.js";
import { authenticateUser, ingestReadings } from "./ingestion.service.js";

export async function ingestReadingsHandler(req: Request, res: Response): Promise<void> {
  try {
    const userId = await authenticateUser(req.header("authorization"));
    if (!allowRequest(`ingestion-user:${userId}`, 20, 10 * 60_000)) {
      throw new AuthHttpError(429, "Too many attempts. Wait a few minutes and try again.");
    }
    const result = await ingestReadings(userId, req.body);
    res.status(202).json(result);
  } catch (error) {
    handleRouteError(error, res, "ingestion");
  }
}
