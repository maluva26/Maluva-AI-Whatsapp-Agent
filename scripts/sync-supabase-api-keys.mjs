import fs from "node:fs";

const envPath = ".env.local";

function parseEnv(text) {
  const entries = [];
  const values = {};

  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) {
      entries.push({ raw: line });
      continue;
    }

    const index = line.indexOf("=");
    const key = line.slice(0, index);
    const value = line.slice(index + 1);
    values[key] = value;
    entries.push({ key, value });
  }

  return { entries, values };
}

function serializeEnv(entries, updates) {
  const seen = new Set();
  const lines = entries.map((entry) => {
    if (!entry.key) return entry.raw;
    if (!(entry.key in updates)) return `${entry.key}=${entry.value}`;
    seen.add(entry.key);
    return `${entry.key}=${updates[entry.key]}`;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) lines.push(`${key}=${value}`);
  }

  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

function keyMatches(item, needles) {
  const fields = [
    item.type,
    item.role,
    item.name,
    item.description,
    item.prefix
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return needles.some((needle) => fields.includes(needle));
}

const parsed = parseEnv(fs.readFileSync(envPath, "utf8"));
const supabaseUrl = parsed.values.NEXT_PUBLIC_SUPABASE_URL;
const accessToken = parsed.values.SUPABASE_ACCESS_TOKEN;

if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
if (!accessToken) throw new Error("Missing SUPABASE_ACCESS_TOKEN");

const ref = new URL(supabaseUrl).hostname.split(".")[0];
const response = await fetch(
  `https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`,
  {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  }
);

const keys = await response.json().catch(() => []);
if (!response.ok) {
  throw new Error(`Could not fetch Supabase API keys: ${response.status}`);
}

if (!Array.isArray(keys)) {
  throw new Error("Supabase API keys response was not an array");
}

const publishable = keys.find(
  (item) =>
    typeof item.api_key === "string" &&
    (keyMatches(item, ["publishable", "anon"]) ||
      item.api_key.startsWith("sb_publishable_"))
);

const secret = keys.find(
  (item) =>
    typeof item.api_key === "string" &&
    (keyMatches(item, ["secret", "service_role"]) ||
      item.api_key.startsWith("sb_secret_"))
);

if (!publishable) throw new Error("Could not find a Supabase publishable/anon key");
if (!secret) throw new Error("Could not find a Supabase secret/service key");

const updates = {
  NEXT_PUBLIC_SUPABASE_ANON_KEY: publishable.api_key,
  SUPABASE_SERVICE_ROLE_KEY: secret.api_key
};

fs.writeFileSync(envPath, serializeEnv(parsed.entries, updates));
console.log("Supabase API keys refreshed in .env.local");
