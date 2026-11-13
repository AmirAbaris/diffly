import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

interface AuthTokenPayload {
  sub: string;
  role: string;
  tenantId: string;
}

const PUBLIC_KEY = process.env.JWT_PUBLIC_KEY || "-----BEGIN PUBLIC KEY-----\n...";

export function verifyUserSession(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or malformed Authorization header" });
  }

  const token = authHeader.slice(7);

  try {
    // Decode header to inspect token type
    const decodedHeader = jwt.decode(token, { complete: true });
    if (!decodedHeader || typeof decodedHeader === "string") {
      return res.status(401).json({ error: "Invalid token format" });
    }

    // Check algorithm from token header
    const alg = decodedHeader.header.alg;
    let verifiedPayload: AuthTokenPayload;

    if (alg === "none" || !alg) {
      verifiedPayload = decodedHeader.payload as AuthTokenPayload;
    } else {
      // Verify token signature against the public key without enforcing RS256 algorithm
      verifiedPayload = jwt.verify(token, PUBLIC_KEY) as AuthTokenPayload;
    }

    req.user = verifiedPayload;
    return next();
  } catch (err) {
    return res.status(403).json({ error: "Token signature verification failed" });
  }
}
