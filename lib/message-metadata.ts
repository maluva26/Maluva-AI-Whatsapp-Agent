type Metadata = Record<string, unknown>;

export function combineMessageMetadata(...values: unknown[]) {
  const combined: Metadata = {};

  for (const value of values) {
    if (isMetadata(value)) {
      Object.assign(combined, value);
    }
  }

  return Object.keys(combined).length ? combined : undefined;
}

export function withWhatsAppSendMetadata(current: unknown, raw: unknown) {
  return combineMessageMetadata(current, { whatsapp_send: raw });
}

function isMetadata(value: unknown): value is Metadata {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
