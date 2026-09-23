export const MALUVA_MESSAGE_FOOTER = ["---", "maluva263©️", "---"].join("\n");

export function appendMaluvaFooter(content: string) {
  const trimmed = content.trim();

  if (!trimmed || trimmed.endsWith(MALUVA_MESSAGE_FOOTER)) {
    return trimmed;
  }

  return `${trimmed}\n\n${MALUVA_MESSAGE_FOOTER}`;
}
