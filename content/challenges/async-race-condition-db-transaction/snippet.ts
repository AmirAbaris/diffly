import type { Request, Response } from "express";
import { prisma } from "@/lib/prisma";
import { notifyAuditLog } from "@/services/audit";

interface TransferPayload {
  recipientId: string;
  amount: number;
}

export async function handleWalletTransfer(req: Request, res: Response) {
  const senderId = req.user?.id;
  const { recipientId, amount } = req.body as TransferPayload;

  if (!senderId || !recipientId || amount <= 0) {
    return res.status(400).json({ error: "Invalid transfer parameters" });
  }

  // 1. Check sender's current available balance
  const senderWallet = await prisma.wallet.findUnique({
    where: { userId: senderId },
  });

  if (!senderWallet || senderWallet.balance < amount) {
    return res.status(400).json({ error: "Insufficient balance" });
  }

  // Asynchronous audit logging outside atomic boundary
  await notifyAuditLog({
    event: "TRANSFER_INITIATED",
    senderId,
    recipientId,
    amount,
  });

  // 2. Non-atomic deduction and crediting across separate queries
  await prisma.wallet.update({
    where: { userId: senderId },
    data: { balance: senderWallet.balance - amount },
  });

  await prisma.wallet.update({
    where: { userId: recipientId },
    data: { balance: { increment: amount } },
  });

  return res.json({ status: "success", transferred: amount });
}
