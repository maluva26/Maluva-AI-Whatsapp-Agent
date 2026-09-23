import { getAiReply } from "./ai";
import {
  buildRouterPayload,
  getConversationRouterReply
} from "./conversation-router";
import {
  buildGuidedFlowPayload,
  getGuidedConversationReply
} from "./guided-flow";
import { appendMaluvaFooter } from "./message-footer";
import {
  combineMessageMetadata,
  withWhatsAppSendMetadata
} from "./message-metadata";
import { AI_EXIT_INSTRUCTION, appendModeExitInstruction } from "./mode-exit";
import {
  getRecentMessages,
  insertMessage,
  updateConversationProfileName,
  updateMessageStatus,
  updateMessageStatusByMetaId,
  upsertConversation
} from "./store";
import {
  buildServiceOrderTrackingReply,
  createPendingServiceOrderAndNotifyAdmin,
  processAdminApprovalReply
} from "./service-order-actions";
import { sendWhatsAppText } from "./whatsapp";

type WhatsAppContact = {
  wa_id?: string;
  profile?: {
    name?: string;
  };
};

type WhatsAppTextMessage = {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: {
    body?: string;
  };
};

type WhatsAppStatus = {
  id?: string;
  status?: string;
};

type WhatsAppChangeValue = {
  contacts?: WhatsAppContact[];
  messages?: WhatsAppTextMessage[];
  statuses?: WhatsAppStatus[];
};

type WhatsAppWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: WhatsAppChangeValue;
    }>;
  }>;
};

function getMessageText(message: WhatsAppTextMessage) {
  if (message.type === "text" && message.text?.body?.trim()) {
    return message.text.body.trim();
  }

  return `[${message.type || "unknown"} message received]`;
}

function getContactName(value: WhatsAppChangeValue, waId: string) {
  return (
    value.contacts?.find((contact) => contact.wa_id === waId)?.profile?.name ||
    null
  );
}

async function processStatus(status: WhatsAppStatus) {
  if (!status.id || !status.status) return;
  await updateMessageStatusByMetaId(status.id, status.status, status);
}

async function processIncomingMessage(
  value: WhatsAppChangeValue,
  message: WhatsAppTextMessage
) {
  if (!message.id || !message.from) return;

  const waId = message.from;
  const content = getMessageText(message);
  let conversation = await upsertConversation(waId, getContactName(value, waId));

  const inserted = await insertMessage({
    conversationId: conversation.id,
    role: "user",
    direction: "incoming",
    content,
    whatsappMsgId: message.id,
    status: "received",
    source: "whatsapp",
    rawPayload: message
  });

  if (inserted.duplicate) return;

  const adminApproval = await processAdminApprovalReply({
    waId,
    content,
    source: "whatsapp",
    sendToWhatsApp: true
  });

  if (adminApproval.handled) {
    const reply = appendMaluvaFooter(adminApproval.reply || "");

    if (!reply) return;

    const outgoing = await insertMessage({
      conversationId: conversation.id,
      role: "assistant",
      direction: "outgoing",
      content: reply,
      status: "queued",
      source: "whatsapp",
      rawPayload: adminApproval.rawPayload
    });

    if (!outgoing.message) return;

    try {
      const sent = await sendWhatsAppText(waId, reply);
      await updateMessageStatus(
        outgoing.message.id,
        "sent",
        sent.metaMessageId,
        withWhatsAppSendMetadata(outgoing.message.raw_payload, sent.raw)
      );
    } catch (error) {
      console.error(error);
      await updateMessageStatus(
        outgoing.message.id,
        "failed",
        null,
        combineMessageMetadata(outgoing.message.raw_payload, {
          error: error instanceof Error ? error.message : String(error)
        })
      );
    }

    return;
  }

  if (conversation.mode !== "ai") return;

  const history = await getRecentMessages(conversation.id, 12);
  const routerReply = getConversationRouterReply({
    incoming: content,
    history,
    profileName: conversation.profile_name
  });
  let rawPayload: Record<string, unknown> | undefined = routerReply?.rawPayload;
  let reply =
    routerReply?.reply ||
    "Sorry, I am having trouble replying right now. Please try again soon.";

  if (routerReply?.profileNameToSave) {
    conversation = await updateConversationProfileName(
      conversation.id,
      routerReply.profileNameToSave
    );
  }

  if (!routerReply) {
    let guidedReply = getGuidedConversationReply(content, history);
    let serviceOrderPayload: Record<string, unknown> | undefined;

    if (guidedReply) {
      if (guidedReply.action?.type === "submit_service_order") {
        const orderResult = await createPendingServiceOrderAndNotifyAdmin({
          conversation,
          action: guidedReply.action,
          source: "whatsapp",
          sendToWhatsApp: true
        });

        guidedReply = {
          ...guidedReply,
          reply: orderResult.reply
        };
        serviceOrderPayload = orderResult.rawPayload;
      }

      if (guidedReply.action?.type === "track_service_order") {
        guidedReply = {
          ...guidedReply,
          reply: await buildServiceOrderTrackingReply(
            conversation.wa_id,
            guidedReply.action.query
          )
        };
      }

      reply = guidedReply.reply;
      rawPayload = combineMessageMetadata(
        buildRouterPayload({
          selected: "shop",
          customerName: conversation.profile_name
        }),
        buildGuidedFlowPayload(guidedReply),
        serviceOrderPayload
      );
    } else {
      rawPayload = buildRouterPayload({
        selected: "ai",
        customerName: conversation.profile_name
      });

      try {
        reply = await getAiReply(history, conversation.profile_name);
      } catch (error) {
        console.error(error);
      }

      reply = appendModeExitInstruction(reply, AI_EXIT_INSTRUCTION);
    }
  }

  reply = appendMaluvaFooter(reply);

  const outgoing = await insertMessage({
    conversationId: conversation.id,
    role: "assistant",
    direction: "outgoing",
    content: reply,
    status: "queued",
    source: "whatsapp",
    rawPayload
  });

  if (!outgoing.message) return;

  try {
    const sent = await sendWhatsAppText(waId, reply);
    await updateMessageStatus(
      outgoing.message.id,
      "sent",
      sent.metaMessageId,
      withWhatsAppSendMetadata(outgoing.message.raw_payload, sent.raw)
    );
  } catch (error) {
    console.error(error);
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

export async function processWhatsAppWebhook(payload: WhatsAppWebhookPayload) {
  const changes =
    payload.entry?.flatMap((entry) => entry.changes || []).filter(Boolean) || [];

  for (const change of changes) {
    const value = change.value;
    if (!value) continue;

    for (const status of value.statuses || []) {
      await processStatus(status);
    }

    for (const message of value.messages || []) {
      await processIncomingMessage(value, message);
    }
  }
}
