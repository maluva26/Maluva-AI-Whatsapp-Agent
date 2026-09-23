import { serverEnv } from "./env";

export type SendWhatsAppMessageResult = {
  metaMessageId: string | null;
  raw: unknown;
};

export function escapeWhatsAppText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[\\*_~`]/g, "\\$&")
    .trim()
    .slice(0, 4096);
}

export async function sendWhatsAppText(
  to: string,
  text: string
): Promise<SendWhatsAppMessageResult> {
  const safeText = escapeWhatsAppText(text);
  const url = `https://graph.facebook.com/${serverEnv.whatsappGraphVersion()}/${serverEnv.whatsappPhoneNumberId()}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serverEnv.whatsappAccessToken()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: {
        preview_url: false,
        body: safeText
      }
    })
  });

  const raw = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `WhatsApp send failed: ${response.status} ${JSON.stringify(raw)}`
    );
  }

  const metaMessageId =
    typeof raw === "object" &&
    raw !== null &&
    "messages" in raw &&
    Array.isArray(raw.messages)
      ? raw.messages[0]?.id ?? null
      : null;

  return { metaMessageId, raw };
}
