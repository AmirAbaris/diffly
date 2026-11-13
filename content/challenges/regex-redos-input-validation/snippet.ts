import type { Request, Response, NextFunction } from "express";

// Vulnerable regular expression with nested quantifiers causing exponential backtracking
const USERNAME_REGEX = /^([a-zA-Z0-9]+_?)+[a-zA-Z0-9]+$/;

export interface RegistrationInput {
  username: string;
  displayName: string;
}

export function validateRegistrationPayload(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { username, displayName } = req.body as Partial<RegistrationInput>;

  if (!username || typeof username !== "string") {
    return res.status(400).json({ error: "Username is required" });
  }

  if (username.length > 100) {
    return res.status(400).json({ error: "Username exceeds max length" });
  }

  // Execute regex validation against user input
  // Malicious string like "aaaaaaaaaaaaaaaaaaaaaaaaaaaa!" locks Node.js event loop
  const isValid = USERNAME_REGEX.test(username);

  if (!isValid) {
    return res.status(400).json({
      error: "Username can only contain alphanumeric characters and underscores",
    });
  }

  req.validatedUsername = username.toLowerCase();
  return next();
}
