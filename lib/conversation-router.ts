import {
  buildGuidedFlowPayload,
  hasActiveGuidedFlow,
  startGuidedStoreFlow
} from "./guided-flow";
import { combineMessageMetadata } from "./message-metadata";
import { AI_EXIT_INSTRUCTION, appendModeExitInstruction } from "./mode-exit";
import type { Message } from "./types";

type RouterStage = "awaiting_name" | "route_choice";
type RouteChoice = "ai" | "shop";

type RouterPayload = {
  maluva_router?: {
    name?: string;
    next_stage?: RouterStage;
    selected?: RouteChoice;
    customer_name?: string;
  };
};

export type ConversationRouterResult = {
  reply: string;
  rawPayload?: Record<string, unknown>;
  profileNameToSave?: string;
};

const ROUTER_NAME = "maluva_entry";

export function buildRouterPayload(input: {
  nextStage?: RouterStage;
  selected?: RouteChoice;
  customerName?: string | null;
}) {
  return {
    maluva_router: {
      name: ROUTER_NAME,
      next_stage: input.nextStage,
      selected: input.selected,
      customer_name: input.customerName || undefined
    }
  };
}

export function getConversationRouterReply(input: {
  incoming: string;
  history: Message[];
  profileName?: string | null;
}): ConversationRouterResult | null {
  const normalized = normalizeInput(input.incoming);
  const previousContext = getPreviousRouterContext(input.history);
  const previousStage = previousContext?.stage;
  const previousSelection = previousContext?.selected;
  const profileName = normalizeSavedName(input.profileName);

  if (!normalized) return null;

  if (
    isModeExitRequest(normalized) &&
    (hasActiveGuidedFlow(input.history) ||
      previousSelection === "ai" ||
      previousSelection === "shop")
  ) {
    return showRouteMenu(profileName);
  }

  if (previousStage === "awaiting_name") {
    return handleNameReply(input.incoming);
  }

  if (isFirstCustomerTurn(input.history) || (!profileName && isEntryMenuRequest(normalized))) {
    return askForName();
  }

  if (previousStage === "route_choice") {
    return handleRouteChoice(normalized, profileName);
  }

  if (isEntryMenuRequest(normalized) && !hasActiveGuidedFlow(input.history)) {
    return showRouteMenu(profileName);
  }

  return null;
}

function askForName(): ConversationRouterResult {
  return {
    reply: [
      "Welcome to Maluva.",
      "",
      "Please send your name so I can save it for this chat.",
      "",
      "After that, choose one option:",
      "",
      "1. Proceed with Maluva AI bot",
      "2. Shop (tech freelance services)",
      "",
      "Reply 0 anytime for this menu."
    ].join("\n"),
    rawPayload: buildRouterPayload({ nextStage: "awaiting_name" })
  };
}

function handleNameReply(incoming: string): ConversationRouterResult {
  const name = extractCustomerName(incoming);

  if (!name) {
    return {
      reply: "Please send your name using letters, for example: Maluva.",
      rawPayload: buildRouterPayload({ nextStage: "awaiting_name" })
    };
  }

  return {
    reply: buildRouteMenuReply(name),
    rawPayload: buildRouterPayload({
      nextStage: "route_choice",
      customerName: name
    }),
    profileNameToSave: name
  };
}

function showRouteMenu(profileName: string | null): ConversationRouterResult {
  return {
    reply: buildRouteMenuReply(profileName),
    rawPayload: buildRouterPayload({
      nextStage: "route_choice",
      customerName: profileName
    })
  };
}

function handleRouteChoice(
  normalized: string,
  profileName: string | null
): ConversationRouterResult {
  const choice = getRouteChoice(normalized);

  if (!choice) {
    return {
      reply: [
        "Please choose one option:",
        "",
        "1. Proceed with Maluva AI bot",
        "2. Shop (tech freelance services)",
        "",
        "Reply 0 anytime for this menu."
      ].join("\n"),
      rawPayload: buildRouterPayload({
        nextStage: "route_choice",
        customerName: profileName
      })
    };
  }

  if (choice === "ai") {
    return {
      reply: appendModeExitInstruction(
        [
          profileName
            ? `You are now chatting with Maluva AI bot, ${profileName}.`
            : "You are now chatting with Maluva AI bot.",
          "",
          "Send your question and I will help.",
          "",
          "Reply 0 for the main menu."
        ].join("\n"),
        AI_EXIT_INSTRUCTION
      ),
      rawPayload: buildRouterPayload({
        selected: "ai",
        customerName: profileName
      })
    };
  }

  const guidedReply = startGuidedStoreFlow(profileName);

  return {
    reply: guidedReply.reply,
    rawPayload: combineMessageMetadata(
      buildRouterPayload({
        selected: "shop",
        customerName: profileName
      }),
      buildGuidedFlowPayload(guidedReply)
    )
  };
}

function buildRouteMenuReply(profileName: string | null) {
  return [
    profileName ? `Thanks, ${profileName}.` : "Welcome back.",
    "",
    "Please choose one option:",
    "",
    "1. Proceed with Maluva AI bot",
    "2. Shop (tech freelance services)",
    "",
    "Reply 0 anytime for this menu."
  ].join("\n");
}

function getPreviousRouterContext(history: Message[]) {
  for (const message of [...history].reverse()) {
    if (message.role !== "assistant" || message.direction !== "outgoing") {
      continue;
    }

    const payload = message.raw_payload as RouterPayload | null;
    const router = payload?.maluva_router;

    if (router?.name === ROUTER_NAME) {
      return {
        stage: router.next_stage,
        selected: router.selected
      };
    }

    return null;
  }

  return null;
}

function isModeExitRequest(normalized: string) {
  return normalized === "#";
}

function isFirstCustomerTurn(history: Message[]) {
  return history.filter((message) => message.role !== "system").length <= 1;
}

function getRouteChoice(normalized: string): RouteChoice | null {
  if (
    normalized === "1" ||
    normalized === "one" ||
    normalized.includes("ai") ||
    normalized.includes("bot")
  ) {
    return "ai";
  }

  if (
    normalized === "2" ||
    normalized === "two" ||
    normalized.includes("shop") ||
    normalized.includes("store") ||
    normalized.includes("tech") ||
    normalized.includes("freelance")
  ) {
    return "shop";
  }

  return null;
}

function isEntryMenuRequest(normalized: string) {
  return [
    "0",
    "hi",
    "hie",
    "hello",
    "hey",
    "menu",
    "main menu",
    "start",
    "restart"
  ].includes(normalized);
}

function extractCustomerName(value: string) {
  const cleaned = value
    .replace(/[^a-zA-Z\s'-]/g, " ")
    .replace(/\b(my name is|i am|i'm|im|am)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length < 2 || cleaned.length > 60 || !/[a-zA-Z]/.test(cleaned)) {
    return null;
  }

  const disallowed = normalizeInput(cleaned);
  if (isEntryMenuRequest(disallowed) || getRouteChoice(disallowed)) {
    return null;
  }

  return cleaned
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function normalizeSavedName(value?: string | null) {
  if (!value?.trim()) return null;
  return value.trim();
}

function normalizeInput(value: string) {
  return value
    .toLowerCase()
    .replace(/[^#a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
