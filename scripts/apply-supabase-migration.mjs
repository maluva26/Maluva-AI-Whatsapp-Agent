import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const envPath = path.join(root, ".env.local");
const migrationsDir = path.join(root, "supabase", "migrations");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;

    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index);
    const value = trimmed.slice(index + 1);
    process.env[key] ??= value;
  }
}

function redact(value) {
  return String(value).replace(/[A-Za-z0-9_-]{20,}/g, "[redacted]");
}

loadEnvFile(envPath);

const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

if (!accessToken) throw new Error("Missing SUPABASE_ACCESS_TOKEN");
if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
if (!fs.existsSync(migrationsDir)) throw new Error(`Missing ${migrationsDir}`);

const projectRef = new URL(supabaseUrl).hostname.split(".")[0];

async function post(pathname, body) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}${pathname}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }
  );

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} ${redact(text)}`);
  }

  return data;
}

const before = await post("/database/query", {
  query:
    "select table_name from information_schema.tables where table_schema = 'public' and table_name in ('conversations','messages','service_orders') order by table_name",
  read_only: true
});

console.log("Before:", JSON.stringify(before));

let appliedNames = new Set();
try {
  const applied = await post("/database/query", {
    query: "select name from supabase_migrations.schema_migrations",
    read_only: true
  });

  appliedNames = new Set(
    Array.isArray(applied)
      ? applied.map((migration) => migration.name).filter(Boolean)
      : []
  );
} catch (error) {
  console.warn("Could not read applied migration names; continuing carefully.");
}

const migrationFiles = fs
  .readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort();

for (const file of migrationFiles) {
  const name = file.replace(/^\d+_/, "").replace(/\.sql$/, "");
  if (appliedNames.has(name)) {
    console.log(`Skipping already applied migration: ${name}`);
    continue;
  }

  const query = fs.readFileSync(path.join(migrationsDir, file), "utf8");
  console.log(`Applying migration: ${name}`);

  try {
    await post("/database/migrations", { name, query });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/already exists|duplicate/i.test(message)) {
      console.log(`Skipping duplicate migration: ${name}`);
      continue;
    }

    throw error;
  }
}

const after = await post("/database/query", {
  query:
    "select table_name from information_schema.tables where table_schema = 'public' and table_name in ('conversations','messages','service_orders') order by table_name",
  read_only: true
});

console.log("After:", JSON.stringify(after));
