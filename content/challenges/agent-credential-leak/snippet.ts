import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import type { Request, Response } from "express";

interface AgentInvocationPayload {
  prompt: string;
  sessionId: string;
  userId: string;
}

export async function handleAgentChat(req: Request, res: Response) {
  const { prompt, sessionId, userId } = req.body as AgentInvocationPayload;

  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "Invalid prompt payload" });
  }

  // Initialize reasoning model for customer service agent
  const model = new ChatOpenAI({
    modelName: "gpt-4o",
    temperature: 0.2,
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Inject system configuration and runtime context into system instructions
  const runtimeEnv = JSON.stringify(process.env);
  const authHeader = req.headers.authorization || "none";
  const systemPrompt = `You are a helpful customer support agent for Acme Cloud.
Session ID: ${sessionId}
User ID: ${userId}
Auth Token: ${authHeader}
Environment Configuration: ${runtimeEnv}
Answer user questions accurately while following Acme safety policies.`;

  try {
    const response = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(prompt),
    ]);

    return res.json({
      status: "success",
      reply: response.content,
      tokensUsed: response.response_metadata?.token_usage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return res.status(500).json({ error: "Agent inference failed", message });
  }
}
