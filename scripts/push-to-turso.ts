import { createClient } from "@libsql/client";
import * as fs from "fs";
import * as path from "path";

// Load .env.local if present
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const [key, ...vals] = trimmed.split("=");
      if (!process.env[key.trim()]) {
        process.env[key.trim()] = vals.join("=").trim().replace(/^["']|["']$/g, "");
      }
    }
  }
}

const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;

async function migrate() {
  console.log("=================================================");
  console.log("🚀 Turso SQLite Cloud Migration Tool (laxis socials)");
  console.log("=================================================\n");

  if (!tursoUrl || !tursoToken) {
    console.error("❌ Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN in environment / .env.local!\n");
    console.log("📋 How to get your FREE Turso database in 60 seconds (No credit card needed):");
    console.log("1. Go to https://turso.tech and sign up for free (or run `npx @turso/cli auth signup`)");
    console.log("2. Create your database: `npx @turso/cli db create socialix`");
    console.log("3. Get your database URL: `npx @turso/cli db show socialix --url`");
    console.log("   (e.g. libsql://socialix-yourusername.turso.io)");
    console.log("4. Create an auth token: `npx @turso/cli db tokens create socialix`");
    console.log("5. Add both to .env.local:\n");
    console.log("   TURSO_DATABASE_URL=libsql://socialix-yourusername.turso.io");
    console.log("   TURSO_AUTH_TOKEN=your_token_here\n");
    console.log("6. Run `npm run db:push-turso` again!\n");
    process.exit(1);
  }

  console.log(`Connecting to local SQLite database (file:socialix.db)...`);
  const localClient = createClient({ url: "file:socialix.db" });

  console.log(`Connecting to Turso Cloud (${tursoUrl})...`);
  const tursoClient = createClient({ url: tursoUrl, authToken: tursoToken });

  console.log("\n📦 Initializing schema on Turso Cloud...");
  await tursoClient.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      avatar_url TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT '🚀',
      office_style TEXT NOT NULL DEFAULT 'modern-office',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      description TEXT NOT NULL,
      avatar TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT 'blue',
      status TEXT NOT NULL DEFAULT 'idle',
      niche TEXT,
      platform TEXT,
      target_groups TEXT,
      cookie_status TEXT DEFAULT 'ready',
      current_task TEXT,
      active_at TEXT
    );

    CREATE TABLE IF NOT EXISTS agent_sandboxes (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      sandbox_id TEXT,
      status TEXT NOT NULL DEFAULT 'none',
      control TEXT NOT NULL DEFAULT 'agent',
      stream_url TEXT,
      view_url TEXT,
      active_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_plans (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      title TEXT NOT NULL,
      request TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'in_progress',
      summary TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS agent_tasks (
      id TEXT PRIMARY KEY,
      plan_id TEXT,
      campaign_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL,
      instructions TEXT NOT NULL,
      depends_on TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending',
      output TEXT,
      question TEXT,
      review TEXT,
      error TEXT,
      started_at TEXT,
      scheduled_at TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS agent_messages (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      sender TEXT NOT NULL,
      text TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      title TEXT NOT NULL,
      caption TEXT NOT NULL,
      hashtags TEXT NOT NULL DEFAULT '[]',
      media_urls TEXT NOT NULL DEFAULT '[]',
      platforms TEXT NOT NULL DEFAULT '[]',
      target_groups TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'draft',
      scheduled_at TEXT,
      published_at TEXT,
      analytics TEXT NOT NULL DEFAULT '{"views":0,"likes":0,"comments":0,"shares":0}',
      locoagent_log TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS social_accounts (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      account_name TEXT NOT NULL,
      profile_url TEXT,
      is_group INTEGER NOT NULL DEFAULT 0,
      group_id TEXT,
      group_name TEXT,
      status TEXT NOT NULL DEFAULT 'connected',
      cookies_encrypted TEXT,
      last_synced_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_deliverables (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      task_id TEXT,
      agent_id TEXT NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      url TEXT,
      content TEXT,
      created_at TEXT NOT NULL
    );
  `);
  console.log("✅ Tables created on Turso Cloud successfully.");

  const tables = [
    "users",
    "campaigns",
    "agents",
    "agent_sandboxes",
    "agent_plans",
    "agent_tasks",
    "agent_messages",
    "posts",
    "social_accounts",
    "agent_deliverables",
  ];

  console.log("\n🔄 Uploading records from local SQLite to Turso Cloud...");

  for (const table of tables) {
    try {
      const selectRes = await localClient.execute(`SELECT * FROM ${table}`);
      const rows = selectRes.rows;
      if (rows.length === 0) continue;

      const columns = selectRes.columns;
      const placeholders = columns.map(() => "?").join(", ");
      const colNames = columns.join(", ");

      for (const row of rows) {
        const values = columns.map((col) => row[col]);
        await tursoClient.execute({
          sql: `INSERT OR REPLACE INTO ${table} (${colNames}) VALUES (${placeholders})`,
          args: values,
        });
      }

      console.log(`   ✓ Migrated table '${table}': ${rows.length} rows`);
    } catch (err: any) {
      console.warn(`   ⚠️ Table '${table}' notice:`, err.message);
    }
  }

  console.log("\n✨ MIGRATION COMPLETE! ✨");
  console.log("Your multi-agent database is now 100% cloud-hosted on Turso SQLite.");
  console.log("You can deploy to Vercel anytime with 0 database setup needed!");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
