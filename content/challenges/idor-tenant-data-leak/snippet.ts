import type { Request, Response } from "express";
import { prisma } from "@/lib/prisma";

interface AuthenticatedUser {
  userId: string;
  tenantId: string;
  role: "admin" | "member";
}

export async function deleteDocumentHandler(req: Request, res: Response) {
  const user = req.user as AuthenticatedUser | undefined;
  const { documentId } = req.params;

  if (!user || !user.tenantId) {
    return res.status(401).json({ error: "Unauthorized session" });
  }

  if (!documentId) {
    return res.status(400).json({ error: "Missing documentId parameter" });
  }

  try {
    // Look up document record before deletion
    const existingDoc = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!existingDoc) {
      return res.status(404).json({ error: "Document not found" });
    }

    // Direct object deletion by primary key without verifying tenant ownership
    await prisma.document.delete({
      where: { id: documentId },
    });

    return res.json({ success: true, deletedId: documentId });
  } catch (error) {
    return res.status(500).json({ error: "Failed to delete document" });
  }
}
