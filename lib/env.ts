const DEFAULT_PROMPT =
  "You are a helpful WhatsApp assistant. Keep replies clear, friendly, and concise.";

export function getEnv(name: string, fallback?: string) {
  const value = process.env[name] || fallback;
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export const serverEnv = {
  supabaseUrl: () => getEnv("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseServiceRoleKey: () => getEnv("SUPABASE_SERVICE_ROLE_KEY"),
  whatsappVerifyToken: () => getEnv("WHATSAPP_VERIFY_TOKEN"),
  whatsappAccessToken: () => getEnv("WHATSAPP_ACCESS_TOKEN"),
  whatsappPhoneNumberId: () => getEnv("WHATSAPP_PHONE_NUMBER_ID"),
  whatsappGraphVersion: () => getEnv("WHATSAPP_GRAPH_VERSION", "v26.0"),
  adminWhatsAppWaId: () =>
    getEnv("ADMIN_WHATSAPP_WA_ID", "263789733173").replace(/[^\d]/g, ""),
  openRouterApiKey: () => getEnv("OPENROUTER_API_KEY"),
  openRouterModel: () =>
    getEnv("OPENROUTER_MODEL", "nex-agi/nex-n2.5-mini:free"),
  openRouterSiteUrl: () => getEnv("OPENROUTER_SITE_URL", "http://localhost:3000"),
  openRouterAppName: () => getEnv("OPENROUTER_APP_NAME", "WhatsApp AI Agent"),
  aiSystemPrompt: () => getEnv("AI_SYSTEM_PROMPT", DEFAULT_PROMPT)
};
