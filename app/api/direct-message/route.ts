import { NextResponse } from "next/server";

import { getConversationRouterReply } from "@/lib/conversation-router";
import {
  buildGuidedFlowPayload,
  getGuidedConversationReply
} from "@/lib/guided-flow";
import { appendMaluvaFooter } from "@/lib/message-footer";
import {
  combineMessageMetadata,
  withWhatsAppSendMetadata
} from "@/lib/message-metadata";
import {
  getRecentMessages,
  insertMessage,
  normalizeWaId,
  updateConversationProfileName,
  updateMessageStatus,
  upsertConversation
} from "@/lib/store";
import {
  buildServiceOrderTrackingReply,
  createPendingServiceOrderAndNotifyAdmin,
  processAdminApprovalReply
} from "@/lib/service-order-actions";
import { sendWhatsAppText } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const waId = normalizeWaId(String(body.waId || ""));
  const profileName =
    typeof body.profileName === "string" && body.profileName.trim()
      ? body.profileName.trim()
      : null;
  const incoming =
    typeof body.incoming === "string" && body.incoming.trim()
      ? body.incoming.trim()
      : "";
  const response =
    typeof body.response === "string" && body.response.trim()
      ? body.response.trim()
      : "";
  const sendToWhatsApp = Boolean(body.sendToWhatsApp);

  if (!waId || !incoming) {
    return NextResponse.json(
      { error: "Phone and incoming message are required" },
      { status: 400 }
    );
  }

  let conversation = await upsertConversation(waId, profileName);

  await insertMessage({
    conversationId: conversation.id,
    role: "user",
    direction: "incoming",
    content: incoming,
    status: "created",
    source: "direct"
  });

  const adminApproval = response
    ? null
    : await processAdminApprovalReply({
        waId,
        content: incoming,
        source: "direct",
        sendToWhatsApp
      });

  const history = await getRecentMessages(conversation.id, 12);
  const routerReply = response || adminApproval?.handled
    ? null
    : getConversationRouterReply({
        incoming,
        history,
        profileName: conversation.profile_name
      });

  if (routerReply?.profileNameToSave) {
    conversation = await updateConversationProfileName(
      conversation.id,
      routerReply.profileNameToSave
    );
  }

  let guidedReply =
    response || adminApproval?.handled || routerReply
      ? null
      : getGuidedConversationReply(incoming, history);
  let serviceOrderPayload: Record<string, unknown> | undefined;

  if (guidedReply?.action?.type === "submit_service_order") {
    const orderResult = await createPendingServiceOrderAndNotifyAdmin({
      conversation,
      action: guidedReply.action,
      source: "direct",
      sendToWhatsApp
    });

    guidedReply = {
      ...guidedReply,
      reply: orderResult.reply
    };
    serviceOrderPayload = orderResult.rawPayload;
  }

  if (guidedReply?.action?.type === "track_service_order") {
    guidedReply = {
      ...guidedReply,
      reply: await buildServiceOrderTrackingReply(
        conversation.wa_id,
        guidedReply.action.query
      )
    };
  }

  const rawPayload = combineMessageMetadata(
    adminApproval?.rawPayload,
    routerReply?.rawPayload,
    guidedReply ? buildGuidedFlowPayload(guidedReply) : undefined,
    serviceOrderPayload
  );
  const outgoingContent = appendMaluvaFooter(
    response ||
      adminApproval?.reply ||
      routerReply?.reply ||
      guidedReply?.reply ||
      ""
  );

  if (!outgoingContent) {
    return NextResponse.json(
      {
        error:
          "Bot response is required when the incoming message is outside the guided menu"
      },
      { status: 400 }
    );
  }

  const outgoing = await insertMessage({
    conversationId: conversation.id,
    role: "assistant",
    direction: "outgoing",
    content: outgoingContent,
    status: sendToWhatsApp ? "queued" : "saved",
    source: "direct",
    rawPayload
  });

  if (sendToWhatsApp && outgoing.message) {
    try {
      const sent = await sendWhatsAppText(waId, outgoingContent);
      await updateMessageStatus(
        outgoing.message.id,
        "sent",
        sent.metaMessageId,
        withWhatsAppSendMetadata(outgoing.message.raw_payload, sent.raw)
      );
    } catch (error) {
      await updateMessageStatus(
        outgoing.message.id,
        "failed",
        null,
        combineMessageMetadata(outgoing.message.raw_payload, {
          error: error instanceof Error ? error.message : String(error)
        })
      );
    }
  }

  return NextResponse.json({ conversation, response: outgoingContent });
}
