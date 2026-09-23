import {
  appendModeExitInstruction,
  SHOP_EXIT_INSTRUCTION
} from "./mode-exit";
import type { Message } from "./types";

export type GuidedFlowStage =
  | "main_menu"
  | "service_category"
  | "service_selection"
  | "service_details"
  | "service_contact"
  | "track_order"
  | "support_request";

export type GuidedFlowState = {
  category_id?: string;
  category_label?: string;
  service_id?: string;
  service_label?: string;
  project_details?: string;
};

export type GuidedFlowAction =
  | {
      type: "submit_service_order";
      categoryId: string;
      categoryLabel: string;
      serviceId: string;
      serviceLabel: string;
      projectDetails: string;
      contactDetails: string;
    }
  | {
      type: "track_service_order";
      query: string;
    };

export type GuidedFlowResult = {
  reply: string;
  nextStage: GuidedFlowStage;
  state?: GuidedFlowState;
  action?: GuidedFlowAction;
};

type GuidedFlowPayload = {
  guided_flow?: {
    name?: string;
    next_stage?: GuidedFlowStage;
  } & GuidedFlowState;
};

type ServiceCategory = {
  id: string;
  label: string;
  services: string[];
};

const FLOW_NAME = "maluva_tech_shop";

const SERVICE_CATEGORIES: ServiceCategory[] = [
  {
    id: "software-development",
    label: "Software Development",
    services: [
      "Web development (frontend, backend, full-stack)",
      "Mobile app development (iOS, Android, cross-platform)",
      "Desktop application development",
      "API development and integration",
      "E-commerce platform building (Shopify, WooCommerce, custom)",
      "Browser extension development",
      "Game development"
    ]
  },
  {
    id: "data-ai",
    label: "Data & AI",
    services: [
      "Data analysis and visualization",
      "Machine learning model development",
      "AI chatbot/agent building",
      "Data engineering (pipelines, ETL)",
      "Data scraping and automation",
      "Predictive analytics and forecasting",
      "Natural language processing projects"
    ]
  },
  {
    id: "infrastructure-systems",
    label: "Infrastructure & Systems",
    services: [
      "Cloud architecture (AWS, Azure, GCP)",
      "DevOps and CI/CD pipeline setup",
      "Database design and administration",
      "System administration",
      "Server setup and maintenance",
      "Network configuration"
    ]
  },
  {
    id: "cybersecurity",
    label: "Cybersecurity",
    services: [
      "Penetration testing / ethical hacking",
      "Security audits and vulnerability assessments",
      "Setting up firewalls, VPNs, encryption",
      "Incident response consulting",
      "Compliance auditing (GDPR, ISO 27001, etc.)"
    ]
  },
  {
    id: "specialized-technical-work",
    label: "Specialized Technical Work",
    services: [
      "Blockchain/smart contract development",
      "IoT (Internet of Things) systems",
      "Embedded systems programming",
      "Computer vision projects",
      "AR/VR development",
      "Robotics programming"
    ]
  },
  {
    id: "consulting-advisory",
    label: "Consulting & Advisory",
    services: [
      "IT strategy consulting",
      "Software architecture consulting",
      "Technical due diligence (for investors)",
      "Digital transformation advisory",
      "Tech stack selection guidance",
      "Code audits/reviews"
    ]
  },
  {
    id: "maintenance-support",
    label: "Maintenance & Support",
    services: [
      "Bug fixing and debugging",
      "Legacy system modernization",
      "Website/app maintenance retainers",
      "Technical support / helpdesk services",
      "Performance optimization"
    ]
  },
  {
    id: "testing-qa",
    label: "Testing & QA",
    services: [
      "Manual and automated testing",
      "QA process setup",
      "Test automation framework building"
    ]
  },
  {
    id: "teaching-content",
    label: "Teaching & Content",
    services: [
      "Technical writing (documentation, blogs)",
      "Online course creation (Udemy, Coursera-style)",
      "Coding tutoring/mentoring",
      "Technical YouTube content",
      "Writing technical books/ebooks"
    ]
  },
  {
    id: "product-focused-work",
    label: "Product-Focused Work",
    services: [
      "MVP (Minimum Viable Product) building for startups",
      "SaaS product development",
      "No-code/low-code app building (Bubble, Webflow, Adalo)",
      "UI/UX prototyping (technical side)"
    ]
  },
  {
    id: "niche-emerging-areas",
    label: "Niche/Emerging Areas",
    services: [
      "Quantum computing consulting",
      "Green tech/sustainability software",
      "FinTech development (payments, trading systems)",
      "HealthTech solutions",
      "EdTech platforms",
      "GovTech projects"
    ]
  },
  {
    id: "freelance-platforms-outreach",
    label: "Freelance Platforms & Outreach",
    services: [
      "Upwork, Fiverr, Toptal, Freelancer.com profile/service setup",
      "Contra, Gun.io developer-focused profile setup",
      "LinkedIn direct outreach systems",
      "GitHub-based hiring and Gitcoin crypto/OSS work",
      "Local business network outreach setup"
    ]
  }
];

const mainMenuReply = [
  "Welcome to Maluva Tech Shop.",
  "",
  "Please select an option to proceed:",
  "",
  "1. Browse tech services",
  "2. Book/order a tech service",
  "3. Track my service order",
  "4. Talk to support",
  "",
  "Reply 0 anytime to return to this menu."
].join("\n");

const projectDetailsPrompt = [
  "Please send a short project brief.",
  "",
  "Include the goal, features needed, deadline, budget range if available, and any links or files you want reviewed.",
  "",
  "Reply 0 for the main menu."
].join("\n");

const orderContactReply = [
  "Thanks. Please send your contact details for this booking.",
  "",
  "Include your name, WhatsApp/phone number if different, email if available, and your preferred meeting time.",
  "",
  "Reply 0 for the main menu."
].join("\n");

const trackOrderReply = [
  "Please send your acceptance code, for example ACC-1234ABCD.",
  "",
  "If you do not have a code yet, send your WhatsApp number and I will check the latest request linked to this chat.",
  "",
  "Reply 0 for the main menu."
].join("\n");

const supportReply = [
  "📞 Need help? Feel free to reach out to our support team — Maluva is available at +263 789 733 173 to assist with any questions, technical support or service enquiries you may have. We're happy to help guide you through our offerings and ensure you get the support you need.",
  "",
  "Reply 0 for the main menu."
].join("\n");

export function buildGuidedFlowPayload(result: GuidedFlowResult) {
  return {
    guided_flow: {
      name: FLOW_NAME,
      next_stage: result.nextStage,
      ...result.state
    }
  };
}

export function startGuidedStoreFlow(customerName?: string | null): GuidedFlowResult {
  return menuResult(customerName);
}

export function hasActiveGuidedFlow(history: Message[] = []) {
  return Boolean(getPreviousGuidedContext(history));
}

export function getGuidedConversationReply(
  incoming: string,
  history: Message[] = []
): GuidedFlowResult | null {
  const normalized = normalizeInput(incoming);
  const previousContext = getPreviousGuidedContext(history);
  const previousStage = previousContext?.stage;
  const state = previousContext?.state || {};

  if (!normalized) return null;

  if (isShopExitRequest(normalized) && previousStage) {
    return null;
  }

  if (isMenuRequest(normalized) || isGreeting(normalized)) {
    return previousStage ? menuResult() : null;
  }

  const mainChoice = getMainMenuChoice(normalized);

  switch (previousStage) {
    case "main_menu":
      return mainChoice
        ? handleMainMenuChoice(mainChoice)
        : withReply(
            `Please choose one of the options below.\n\n${mainMenuReply}`,
            "main_menu"
          );

    case "service_category":
      return handleServiceCategory(normalized);

    case "service_selection":
      return handleServiceSelection(normalized, state);

    case "service_details":
      if (!state.service_label || !state.category_label || !state.service_id) {
        return withReply(buildCategoryMenuReply(), "service_category");
      }

      return withReply(orderContactReply, "service_contact", {
        ...state,
        project_details: incoming.trim()
      });

    case "service_contact":
      if (
        !state.category_id ||
        !state.category_label ||
        !state.service_id ||
        !state.service_label ||
        !state.project_details
      ) {
        return withReply(buildCategoryMenuReply(), "service_category");
      }

      return withReply(
        [
          "Thank you. Your tech service order has been received and is waiting for admin approval.",
          "",
          "I will update you here as soon as the admin accepts or rejects it.",
          "",
          "Reply 0 for the main menu."
        ].join("\n"),
        "main_menu",
        undefined,
        {
          type: "submit_service_order",
          categoryId: state.category_id,
          categoryLabel: state.category_label,
          serviceId: state.service_id,
          serviceLabel: state.service_label,
          projectDetails: state.project_details,
          contactDetails: incoming.trim()
        }
      );

    case "track_order":
      return withReply(
        [
          "Checking your service order status.",
          "",
          "Reply 0 for the main menu."
        ].join("\n"),
        "main_menu",
        undefined,
        {
          type: "track_service_order",
          query: incoming.trim()
        }
      );

    case "support_request":
      return withReply(
        [
          "Thanks. Your support request has been captured.",
          "",
          "A team member will reply as soon as possible.",
          "",
          "Reply 0 for the main menu."
        ].join("\n"),
        "main_menu"
      );

    default:
      return null;
  }
}

function getPreviousGuidedContext(history: Message[]) {
  for (const message of [...history].reverse()) {
    if (message.role !== "assistant" || message.direction !== "outgoing") {
      continue;
    }

    const payload = message.raw_payload as GuidedFlowPayload | null;
    const flow = payload?.guided_flow;

    if (flow?.name === FLOW_NAME && flow.next_stage) {
      const state: GuidedFlowState = {
        category_id: flow.category_id,
        category_label: flow.category_label,
        service_id: flow.service_id,
        service_label: flow.service_label,
        project_details: flow.project_details
      };

      return {
        stage: flow.next_stage,
        state
      };
    }

    return null;
  }

  return null;
}

function handleMainMenuChoice(choice: "services" | "order" | "track" | "support") {
  if (choice === "services" || choice === "order") {
    return withReply(buildCategoryMenuReply(), "service_category");
  }

  if (choice === "track") return withReply(trackOrderReply, "track_order");
  return withReply(supportReply, "support_request");
}

function handleServiceCategory(normalized: string): GuidedFlowResult {
  const category = getServiceCategory(normalized);

  if (!category) {
    return withReply(
      `Please choose a tech service area.\n\n${buildCategoryMenuReply()}`,
      "service_category"
    );
  }

  return withReply(buildServiceListReply(category), "service_selection", {
    category_id: category.id,
    category_label: category.label
  });
}

function handleServiceSelection(
  normalized: string,
  state: GuidedFlowState
): GuidedFlowResult {
  const category = SERVICE_CATEGORIES.find((item) => item.id === state.category_id);

  if (!category) {
    return withReply(buildCategoryMenuReply(), "service_category");
  }

  const service = getServiceOption(category, normalized);

  if (!service) {
    return withReply(
      `Please choose a service from ${category.label}.\n\n${buildServiceListReply(
        category
      )}`,
      "service_selection",
      {
        category_id: category.id,
        category_label: category.label
      }
    );
  }

  return withReply(
    [
      `Selected: ${service.label}.`,
      "",
      projectDetailsPrompt
    ].join("\n"),
    "service_details",
    {
      category_id: category.id,
      category_label: category.label,
      service_id: service.id,
      service_label: service.label
    }
  );
}

function buildCategoryMenuReply() {
  return [
    "Maluva Tech Shop - select a service area:",
    "",
    ...SERVICE_CATEGORIES.map((category, index) => `${index + 1}. ${category.label}`),
    "",
    "Reply with the number for the service area you need.",
    "Reply 0 for the main menu."
  ].join("\n");
}

function buildServiceListReply(category: ServiceCategory) {
  return [
    `${category.label} services:`,
    "",
    ...category.services.map((service, index) => `${index + 1}. ${service}`),
    "",
    "Reply with the number for the service you want to book.",
    "Reply 0 for the main menu."
  ].join("\n");
}

function getServiceCategory(normalized: string) {
  const selectedNumber = getSelectedNumber(normalized);

  if (selectedNumber) {
    return SERVICE_CATEGORIES[selectedNumber - 1] || null;
  }

  return (
    SERVICE_CATEGORIES.find((category) =>
      textMatches(normalized, category.label)
    ) || null
  );
}

function getServiceOption(category: ServiceCategory, normalized: string) {
  const selectedNumber = getSelectedNumber(normalized);

  if (selectedNumber) {
    const label = category.services[selectedNumber - 1];

    if (label) {
      return {
        id: `${category.id}-${selectedNumber}`,
        label
      };
    }
  }

  const serviceIndex = category.services.findIndex((service) =>
    textMatches(normalized, service)
  );

  if (serviceIndex >= 0) {
    return {
      id: `${category.id}-${serviceIndex + 1}`,
      label: category.services[serviceIndex]
    };
  }

  return null;
}

function getSelectedNumber(normalized: string) {
  const match = normalized.match(/^\d{1,2}\b/);
  if (!match) return null;

  const value = Number(match[0]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function textMatches(normalizedInput: string, label: string) {
  const normalizedLabel = normalizeInput(label);

  if (normalizedInput.length >= 3 && normalizedLabel.includes(normalizedInput)) {
    return true;
  }

  const inputTokens = normalizedInput
    .split(" ")
    .filter((token) => token.length >= 3);
  if (!inputTokens.length) return false;

  return inputTokens.every((token) => normalizedLabel.includes(token));
}

function getMainMenuChoice(normalized: string) {
  if (
    ["1", "one"].includes(normalized) ||
    normalized.includes("service") ||
    normalized.includes("browse") ||
    normalized.includes("catalog") ||
    normalized.includes("catalogue") ||
    normalized.includes("shop") ||
    normalized.includes("tech")
  ) {
    return "services";
  }

  if (
    ["2", "two"].includes(normalized) ||
    normalized.includes("order") ||
    normalized.includes("book") ||
    normalized.includes("hire") ||
    normalized.includes("request")
  ) {
    return "order";
  }

  if (
    ["3", "three"].includes(normalized) ||
    normalized.includes("track") ||
    normalized.includes("status") ||
    normalized.includes("code")
  ) {
    return "track";
  }

  if (
    ["4", "four"].includes(normalized) ||
    normalized.includes("support") ||
    normalized.includes("agent") ||
    normalized.includes("human") ||
    normalized.includes("help")
  ) {
    return "support";
  }

  return null;
}

function isGreeting(normalized: string) {
  return [
    "hi",
    "hie",
    "hello",
    "hey",
    "good morning",
    "good afternoon",
    "good evening"
  ].includes(normalized);
}

function isMenuRequest(normalized: string) {
  return ["0", "menu", "main menu", "start", "restart", "cancel"].includes(
    normalized
  );
}

function isShopExitRequest(normalized: string) {
  return normalized === "#";
}

function menuResult(customerName?: string | null) {
  if (!customerName) {
    return withReply(mainMenuReply, "main_menu");
  }

  return withReply(
    mainMenuReply.replace(
      "Welcome to Maluva Tech Shop.",
      `Welcome to Maluva Tech Shop, ${customerName}.`
    ),
    "main_menu"
  );
}

function withReply(
  reply: string,
  nextStage: GuidedFlowStage,
  state?: GuidedFlowState,
  action?: GuidedFlowAction
): GuidedFlowResult {
  return {
    reply: appendModeExitInstruction(reply, SHOP_EXIT_INSTRUCTION),
    nextStage,
    state,
    action
  };
}

function normalizeInput(value: string) {
  return value
    .toLowerCase()
    .replace(/[^#a-z0-9?\s/&.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
