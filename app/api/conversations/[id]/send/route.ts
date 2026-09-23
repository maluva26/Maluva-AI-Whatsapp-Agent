import { NextResponse } from "next/server";

import { appendMaluvaFooter } from "@/lib/message-footer";
import { withWhatsAppSendMetadata } from "@/lib/message-metadata";
import {
  getConversation,
  insertMessage,
  updateMessageStatus
} from "@/lib/store";
import { sendWhatsAppText } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = await request.json().catch(() => ({}));
  const rawContent = typeof body.content === "string" ? body.content.trim() : "";

  if (!rawContent) {
    return NextResponse.json({ error: "Message content is required" }, { status: 400 });
  }

  const content = appendMaluvaFooter(rawContent);
  const conversation = await getConversation(params.id);
  const outgoing = await insertMessage({
    conversationId: conversation.id,
    role: "assistant",
    direction: "outgoing",
    content,
    status: "queued",
    source: "dashboard"
  });

  if (!outgoing.message) {
    return NextResponse.json({ error: "Message was not stored" }, { status: 500 });
  }

  try {
    const sent = await sendWhatsAppText(conversation.wa_id, content);
    const message = await updateMessageStatus(
      outgoing.message.id,
      "sent",
      sent.metaMessageId,
      withWhatsAppSendMetadata(outgoing.message.raw_payload, sent.raw)
    );

    return NextResponse.json({ message });
  } catch (error) {
    const message = await updateMessageStatus(outgoing.message.id, "failed", null, {
      error: error instanceof Error ? error.message : String(error)
    });

    return NextResponse.json({ message }, { status: 502 });
  }
}
