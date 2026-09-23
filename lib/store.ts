import { combineMessageMetadata } from "./message-metadata";
import { supabaseAdmin } from "./supabase-admin";
import type {
  Conversation,
  ConversationMode,
  Message,
  MessageDirection,
  MessageRole,
  MessageSource,
  ServiceOrder,
  ServiceOrderStatus
} from "./types";

export type InsertMessageInput = {
  conversationId: string;
  role: MessageRole;
  direction: MessageDirection;
  content: string;
  whatsappMsgId?: string | null;
  metaMessageId?: string | null;
  status?: string;
  source?: MessageSource;
  rawPayload?: unknown;
};

export type CreateServiceOrderInput = {
  conversationId: string;
  customerWaId: string;
  customerName?: string | null;
  serviceCategory: string;
  serviceName: string;
  projectDetails: string;
  contactDetails: string;
  approvalCode: string;
};

export type UpdateServiceOrderDecisionInput = {
  status: Exclude<ServiceOrderStatus, "pending_admin_approval">;
  adminWaId: string;
  decisionMessage: string;
  acceptanceCode?: string | null;
};

export function normalizeWaId(value: string) {
  return value.replace(/[^\d]/g, "");
}

export async function listConversations() {
  const { data, error } = await supabaseAdmin
    .from("conversations")
    .select("*")
    .order("last_message_at", { ascending: false, nullsFirst: false });

  if (error) throw error;
  return data as Conversation[];
}

export async function getConversation(id: string) {
  const { data, error } = await supabaseAdmin
    .from("conversations")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as Conversation;
}

export async function upsertConversation(waId: string, profileName?: string | null) {
  const normalized = normalizeWaId(waId);
  const payload: Pick<Conversation, "wa_id"> & { profile_name?: string | null } = {
    wa_id: normalized
  };

  if (profileName) payload.profile_name = profileName;

  const { data, error } = await supabaseAdmin
    .from("conversations")
    .upsert(payload, { onConflict: "wa_id" })
    .select("*")
    .single();

  if (error) throw error;
  return data as Conversation;
}

export async function setConversationMode(id: string, mode: ConversationMode) {
  const { data, error } = await supabaseAdmin
    .from("conversations")
    .update({ mode })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data as Conversation;
}

export async function updateConversationProfileName(id: string, profileName: string) {
  const { data, error } = await supabaseAdmin
    .from("conversations")
    .update({ profile_name: profileName })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data as Conversation;
}

export async function getMessages(conversationId: string, limit = 100) {
  const { data, error } = await supabaseAdmin
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return data as Message[];
}

export async function getRecentMessages(conversationId: string, limit = 12) {
  const { data, error } = await supabaseAdmin
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data as Message[]).reverse();
}

export async function insertMessage(input: InsertMessageInput) {
  const { data, error } = await supabaseAdmin
    .from("messages")
    .insert({
      conversation_id: input.conversationId,
      role: input.role,
      direction: input.direction,
      content: input.content,
      whatsapp_msg_id: input.whatsappMsgId || null,
      meta_message_id: input.metaMessageId || null,
      status: input.status || "stored",
      source: input.source || "whatsapp",
      raw_payload: input.rawPayload || {}
    })
    .select("*")
    .single();

  if (error?.code === "23505") {
    return { message: null, duplicate: true };
  }

  if (error) throw error;
  return { message: data as Message, duplicate: false };
}

export async function updateMessageStatus(
  id: string,
  status: string,
  metaMessageId?: string | null,
  rawPayload?: unknown
) {
  const update: Record<string, unknown> = { status };
  if (metaMessageId) update.meta_message_id = metaMessageId;
  if (rawPayload) update.raw_payload = rawPayload;

  const { data, error } = await supabaseAdmin
    .from("messages")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data as Message;
}

export async function updateMessageStatusByMetaId(
  metaMessageId: string,
  status: string,
  rawPayload?: unknown
) {
  const update: Record<string, unknown> = { status };

  if (rawPayload) {
    const { data, error } = await supabaseAdmin
      .from("messages")
      .select("raw_payload")
      .eq("meta_message_id", metaMessageId)
      .maybeSingle();

    if (error) throw error;

    update.raw_payload = combineMessageMetadata(data?.raw_payload, {
      whatsapp_status: rawPayload
    });
  }

  const { error } = await supabaseAdmin
    .from("messages")
    .update(update)
    .eq("meta_message_id", metaMessageId);

  if (error) throw error;
}

export async function createServiceOrder(input: CreateServiceOrderInput) {
  const { data, error } = await supabaseAdmin
    .from("service_orders")
    .insert({
      conversation_id: input.conversationId,
      customer_wa_id: normalizeWaId(input.customerWaId),
      customer_name: input.customerName || null,
      service_category: input.serviceCategory,
      service_name: input.serviceName,
      project_details: input.projectDetails,
      contact_details: input.contactDetails,
      status: "pending_admin_approval",
      approval_code: input.approvalCode
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as ServiceOrder;
}

export async function getPendingServiceOrderForAdminDecision(
  approvalCode?: string | null
) {
  let query = supabaseAdmin
    .from("service_orders")
    .select("*")
    .eq("status", "pending_admin_approval");

  if (approvalCode) {
    query = query.eq("approval_code", approvalCode.toUpperCase());
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as ServiceOrder | null) || null;
}

export async function updateServiceOrderDecision(
  id: string,
  input: UpdateServiceOrderDecisionInput
) {
  const { data, error } = await supabaseAdmin
    .from("service_orders")
    .update({
      status: input.status,
      acceptance_code: input.acceptanceCode || null,
      admin_wa_id: normalizeWaId(input.adminWaId),
      admin_decision: input.status,
      admin_decision_message: input.decisionMessage,
      decided_at: new Date().toISOString()
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data as ServiceOrder;
}

export async function findServiceOrderForTracking(
  customerWaId: string,
  queryText: string
) {
  const normalizedCustomerWaId = normalizeWaId(customerWaId);
  const code = extractServiceOrderCode(queryText);

  if (code) {
    const accepted = await findServiceOrderByCode(
      normalizedCustomerWaId,
      "acceptance_code",
      code
    );

    if (accepted) return accepted;

    const pending = await findServiceOrderByCode(
      normalizedCustomerWaId,
      "approval_code",
      code
    );

    if (pending) return pending;
  }

  const { data, error } = await supabaseAdmin
    .from("service_orders")
    .select("*")
    .eq("customer_wa_id", normalizedCustomerWaId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as ServiceOrder | null) || null;
}

async function findServiceOrderByCode(
  customerWaId: string,
  column: "acceptance_code" | "approval_code",
  code: string
) {
  const { data, error } = await supabaseAdmin
    .from("service_orders")
    .select("*")
    .eq("customer_wa_id", customerWaId)
    .eq(column, code)
    .maybeSingle();

  if (error) throw error;
  return (data as ServiceOrder | null) || null;
}

function extractServiceOrderCode(value: string) {
  const match = value.toUpperCase().match(/\b(?:ACC|REQ)-[A-Z0-9]{6,12}\b/);
  return match?.[0] || null;
}
