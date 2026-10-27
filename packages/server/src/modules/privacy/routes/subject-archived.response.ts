import type { Response } from "express";
import { SubjectArchivedError } from "../repositories/subject-freeze.js";

/** ARCH-01 D1: router catch helper; true when the error was a frozen subject and the 409 has been sent. */
export function respondIfSubjectArchived(
  response: Response,
  error: unknown,
): boolean {
  if (!(error instanceof SubjectArchivedError)) return false;
  response.status(409).json({ error: error.code });
  return true;
}
