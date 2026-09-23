import fs from "node:fs";

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    env[line.slice(0, index)] = line.slice(index + 1);
  }
  return env;
}

const env = loadEnv();
const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];

const response = await fetch(
  `https://api.supabase.com/v1/projects/${ref}/database/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      read_only: true,
      query: `
        select 'column' as kind, table_name, column_name, data_type, is_nullable, column_default, null as constraint_name, null as constraint_def
        from information_schema.columns
        where table_schema = 'public'
          and table_name in ('conversations', 'messages')
        union all
        select 'constraint' as kind, t.relname as table_name, null as column_name, null as data_type, null as is_nullable, null as column_default, c.conname as constraint_name, pg_get_constraintdef(c.oid) as constraint_def
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'public'
          and t.relname in ('conversations', 'messages')
        order by table_name, kind, column_name nulls last, constraint_name nulls last
      `
    })
  }
);

console.log(await response.text());
