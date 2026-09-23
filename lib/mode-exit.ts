export const SHOP_EXIT_INSTRUCTION = "Reply # to exit shop.";
export const AI_EXIT_INSTRUCTION = "Reply # to exit AI.";

export function appendModeExitInstruction(content: string, instruction: string) {
  const trimmed = content.trim();

  if (!trimmed || trimmed.includes(instruction)) {
    return trimmed;
  }

  return `${trimmed}\n\n${instruction}`;
}
