export type ConversationMode = "ai" | "manual" | "paused";
export type MessageRole = "user" | "assistant" | "system";
export type MessageDirection = "incoming" | "outgoing";
export type MessageSource = "whatsapp" | "dashboard" | "direct" | "system";
export type ServiceOrderStatus =
  | "pending_admin_approval"
  | "accepted"
  | "rejected";

export type Conversation = {
  id: string;
  wa_id: string;
  profile_name: string | null;
  mode: ConversationMode;
  last_message_preview: string | null;
  last_message_at: string | null;
  message_count: number;
  created_at: string;
  updated_at: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  role: MessageRole;
  direction: MessageDirection;
  content: string;
  whatsapp_msg_id: string | null;
  meta_message_id: string | null;
  status: string;
  source: MessageSource;
  raw_payload: unknown;
  created_at: string;
};

export type ServiceOrder = {
  id: string;
  conversation_id: string;
  customer_wa_id: string;
  customer_name: string | null;
  service_category: string;
  service_name: string;
  project_details: string;
  contact_details: string;
  status: ServiceOrderStatus;
  approval_code: string;
  acceptance_code: string | null;
  admin_wa_id: string | null;
  admin_decision: "accepted" | "rejected" | null;
  admin_decision_message: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DashboardConversation = Conversation & {
  messages?: Message[];
};
