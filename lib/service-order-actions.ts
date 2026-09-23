import { randomUUID } from "node:crypto";

import { serverEnv } from "./env";
import type { GuidedFlowAction } from "./guided-flow";
import { appendMaluvaFooter } from "./message-footer";
import {
  combineMessageMetadata,
  withWhatsAppSendMetadata
} from "./message-metadata";
import {
  appendModeExitInstruction,
  SHOP_EXIT_INSTRUCTION
} from "./mode-exit";
import {
  createServiceOrder,
  findServiceOrderForTracking,
  getPendingServiceOrderForAdminDecision,
  insertMessage,
  normalizeWaId,
  updateMessageStatus,
  updateServiceOrderDecision,
  upsertConversation
} from "./store";
import type {
  Conversation,
  MessageSource,
  ServiceOrder,
  ServiceOrderStatus
} from "./types";
import { sendWhatsAppText } from "./whatsapp";

type SubmitServiceOrderAction = Extract<
  GuidedFlowAction,
  { type: "submit_service_order" }
>;

type CreatePendingServiceOrderInput = {
  conversation: Conversation;
  action: SubmitServiceOrderAction;
  source: MessageSource;
  sendToWhatsApp: boolean;
};

type StoreAndMaybeSendTextInput = {
  to: string;
  profileName?: string | null;
  content: string;
  source: MessageSource;
  sendToWhatsApp: boolean;
  rawPayload?: Record<string, unknown>;
};

export type AdminApprovalResult = {
  handled: boolean;
  reply?: string;
  rawPayload?: Record<string, unknown>;
};

const ADMIN_APPROVAL_FLOW_NAME = "maluva_service_order_approval";

export function isAdminWaId(waId: string) {
  return normalizeWaId(waId) === serverEnv.adminWhatsAppWaId();
}

export async function createPendingServiceOrderAndNotifyAdmin(
  input: CreatePendingServiceOrderInput
) {
  const order = await createServiceOrder({
    conversationId: input.conversation.id,
    customerWaId: input.conversation.wa_id,
    customerName: input.conversation.profile_name,
    serviceCategory: input.action.categoryLabel,
    serviceName: input.action.serviceLabel,
    projectDetails: input.action.projectDetails,
    contactDetails: input.action.contactDetails,
    approvalCode: generateOrderCode("REQ")
  });

  await storeAndMaybeSendText({
    to: serverEnv.adminWhatsAppWaId(),
    profileName: "Maluva Admin",
    content: buildAdminApprovalRequest(order),
    source: input.source,
    sendToWhatsApp: input.sendToWhatsApp,
    rawPayload: buildAdminApprovalPayload(order, "awaiting_decision")
  });

  return {
    order,
    reply: buildCustomerWaitingReply(order),
    rawPayload: buildServiceOrderPayload(order)
  };
}

export async function buildServiceOrderTrackingReply(
  customerWaId: string,
  query: string
) {
  const order = await findServiceOrderForTracking(customerWaId, query);

  if (!order) {
    return appendModeExitInstruction(
      [
        "I could not find a service order linked to this chat.",
        "",
        "Please check the acceptance code, or reply 2 from the main menu to book a new tech service.",
        "",
        "Reply 0 for the main menu."
      ].join("\n"),
      SHOP_EXIT_INSTRUCTION
    );
  }

  return buildTrackingReply(order);
}

export async function processAdminApprovalReply(input: {
  waId: string;
  content: string;
  source: MessageSource;
  sendToWhatsApp: boolean;
}): Promise<AdminApprovalResult> {
  if (!isAdminWaId(input.waId)) {
    return { handled: false };
  }

  const decision = parseAdminDecision(input.content);
  const approvalCode = extractApprovalCode(input.content);
  const pendingOrder = await getPendingServiceOrderForAdminDecision(approvalCode);

  if (!pendingOrder && !decision) {
    return { handled: false };
  }

  if (!pendingOrder) {
    return {
      handled: true,
      reply: [
        "No pending tech service order is waiting for admin approval right now.",
        "",
        "Reply 0 for the main menu."
      ].join("\n"),
      rawPayload: buildAdminApprovalPayload(null, "no_pending_order")
    };
  }

  if (!decision) {
    return {
      handled: true,
      reply: [
        "A tech service order is waiting for your approval.",
        "",
        `Approval code: ${pendingOrder.approval_code}`,
        `Service: ${pendingOrder.service_name}`,
        "",
        "Reply ACCEPT to approve it or REJECT to reject it.",
        "Reply 0 for the main menu after you finish."
      ].join("\n"),
      rawPayload: buildAdminApprovalPayload(pendingOrder, "awaiting_decision")
    };
  }

  const updatedOrder = await updateServiceOrderDecision(pendingOrder.id, {
    status: decision,
    adminWaId: input.waId,
    decisionMessage: input.content,
    acceptanceCode: decision === "accepted" ? generateOrderCode("ACC") : null
  });

  await storeAndMaybeSendText({
    to: updatedOrder.customer_wa_id,
    profileName: updatedOrder.customer_name,
    content: buildCustomerDecisionReply(updatedOrder),
    source: input.source,
    sendToWhatsApp: input.sendToWhatsApp,
    rawPayload: buildServiceOrderPayload(updatedOrder)
  });

  return {
    handled: true,
    reply: buildAdminDecisionReceipt(updatedOrder),
    rawPayload: buildAdminApprovalPayload(updatedOrder, "decision_recorded")
  };
}

function buildCustomerWaitingReply(order: ServiceOrder) {
  return appendModeExitInstruction(
    [
      "Thank you. Your tech service order has been received and is waiting for admin approval.",
      "",
      `Service: ${order.service_name}`,
      "Status: Waiting for admin approval",
      "",
      "If accepted, I will send you an acceptance code to track the order.",
      "",
      "Reply 0 for the main menu."
    ].join("\n"),
    SHOP_EXIT_INSTRUCTION
  );
}

function buildAdminApprovalRequest(order: ServiceOrder) {
  return [
    "New Maluva Tech Shop order needs admin approval.",
    "",
    `Approval code: ${order.approval_code}`,
    `Customer: ${order.customer_name || "Not provided"}`,
    `WhatsApp: +${order.customer_wa_id}`,
    `Category: ${order.service_category}`,
    `Service: ${order.service_name}`,
    "",
    "Project brief:",
    limitText(order.project_details, 900),
    "",
    "Contact details:",
    limitText(order.contact_details, 700),
    "",
    "Reply ACCEPT to approve this order or REJECT to reject it.",
    `You can include the code too, for example: ACCEPT ${order.approval_code}`,
    "Reply 0 for the main menu after you finish."
  ].join("\n");
}

function buildCustomerDecisionReply(order: ServiceOrder) {
  if (order.status === "accepted") {
    return appendModeExitInstruction(
      [
        "Good news. Your tech service order has been accepted.",
        "",
        `Service: ${order.service_name}`,
        `Acceptance code: ${order.acceptance_code}`,
        "",
        "Use this code to track your order status.",
        "",
        "Reply 0 for the main menu."
      ].join("\n"),
      SHOP_EXIT_INSTRUCTION
    );
  }

  return appendModeExitInstruction(
    [
      "Sorry, your tech service order was not approved at this time.",
      "",
      `Service: ${order.service_name}`,
      "Status: Rejected",
      "",
      "You can reply 0 for the main menu and book another service if needed."
    ].join("\n"),
    SHOP_EXIT_INSTRUCTION
  );
}

function buildAdminDecisionReceipt(order: ServiceOrder) {
  return [
    `Admin decision recorded: ${formatStatus(order.status)}.`,
    "",
    `Approval code: ${order.approval_code}`,
    `Service: ${order.service_name}`,
    order.acceptance_code ? `Acceptance code sent: ${order.acceptance_code}` : null,
    "",
    "The customer has been notified.",
    "",
    "Reply 0 for the main menu."
  ]
    .filter(Boolean)
    .join("\n");
}

function buildTrackingReply(order: ServiceOrder) {
  return appendModeExitInstruction(
    [
      "Service order status:",
      "",
      `Service: ${order.service_name}`,
      `Status: ${formatStatus(order.status)}`,
      order.acceptance_code ? `Acceptance code: ${order.acceptance_code}` : null,
      order.status === "pending_admin_approval"
        ? "Your order is still waiting for admin approval."
        : null,
      order.status === "rejected"
        ? "This order was rejected. You can book another service from the main menu."
        : null,
      "",
      "Reply 0 for the main menu."
    ]
      .filter(Boolean)
      .join("\n"),
    SHOP_EXIT_INSTRUCTION
  );
}

async function storeAndMaybeSendText(input: StoreAndMaybeSendTextInput) {
  const conversation = await upsertConversation(input.to, input.profileName);
  const content = appendMaluvaFooter(input.content);

  const outgoing = await insertMessage({
    conversationId: conversation.id,
    role: "assistant",
    direction: "outgoing",
    content,
    status: input.sendToWhatsApp ? "queued" : "saved",
    source: input.source,
    rawPayload: input.rawPayload
  });

  if (!input.sendToWhatsApp || !outgoing.message) {
    return;
  }

  try {
    const sent = await sendWhatsAppText(conversation.wa_id, content);
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

function buildServiceOrderPayload(order: ServiceOrder) {
  return {
    service_order: {
      id: order.id,
      approval_code: order.approval_code,
      acceptance_code: order.acceptance_code,
      status: order.status,
      service_name: order.service_name
    }
  };
}

function buildAdminApprovalPayload(
  order: ServiceOrder | null,
  state: string
) {
  return {
    admin_approval: {
      name: ADMIN_APPROVAL_FLOW_NAME,
      state,
      order_id: order?.id,
      approval_code: order?.approval_code,
      status: order?.status
    }
  };
}

function parseAdminDecision(content: string): Exclude<
  ServiceOrderStatus,
  "pending_admin_approval"
> | null {
  const normalized = content
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/\b(accept|accepted|approve|approved|yes|ok)\b/.test(normalized)) {
    return "accepted";
  }

  if (/\b(reject|rejected|decline|declined|deny|denied|no)\b/.test(normalized)) {
    return "rejected";
  }

  return null;
}

function extractApprovalCode(content: string) {
  const match = content.toUpperCase().match(/\bREQ-[A-Z0-9]{6,12}\b/);
  return match?.[0] || null;
}

function generateOrderCode(prefix: "REQ" | "ACC") {
  return `${prefix}-${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function formatStatus(status: ServiceOrderStatus) {
  if (status === "pending_admin_approval") return "Waiting for admin approval";
  if (status === "accepted") return "Accepted";
  return "Rejected";
}

function limitText(value: string, maxLength: number) {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 3)}...`;
}
