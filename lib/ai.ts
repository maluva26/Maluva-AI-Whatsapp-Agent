import { serverEnv } from "./env";
import type { Message } from "./types";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export function buildAiMessages(
  history: Message[],
  customerName?: string | null
): ChatMessage[] {
  return [
    { role: "system", content: serverEnv.aiSystemPrompt() },
    ...(customerName
      ? [
          {
            role: "system" as const,
            content: `The customer's name is ${customerName}. Use their name sparingly, mainly when greeting them or when it feels natural. Do not include their name in every reply.`
          }
        ]
      : []),
    ...history
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map((message) => ({
        role: message.role as "user" | "assistant",
        content: message.content
      }))
  ];
}

export async function getAiReply(history: Message[], customerName?: string | null) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serverEnv.openRouterApiKey()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": serverEnv.openRouterSiteUrl(),
      "X-OpenRouter-Title": serverEnv.openRouterAppName()
    },
    body: JSON.stringify({
      model: serverEnv.openRouterModel(),
      messages: buildAiMessages(history, customerName),
      temperature: 0.4,
      max_tokens: 350
    })
  });

  const raw = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`OpenRouter failed: ${response.status} ${JSON.stringify(raw)}`);
  }

  const content = raw?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("OpenRouter returned an empty message");
  }

  return content.trim();
}
