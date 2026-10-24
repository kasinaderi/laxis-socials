import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const url = process.env.TURSO_DATABASE_URL || "file:socialix.db";
const authToken = process.env.TURSO_AUTH_TOKEN;

export const client = createClient({
  url,
  authToken,
});

export const db = drizzle(client, { schema });

// Auto-initialize tables
export async function initDb() {
  await client.executeMultiple(`
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

    CREATE TABLE IF NOT EXISTS office_layouts (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      layout_data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

let initPromise: Promise<void> | null = null;
export async function ensureDbInitialized() {
  if (!initPromise) {
    initPromise = initDb().catch((err) => {
      console.warn("DB init notice:", err.message);
    });
  }
  return initPromise;
}

// In development or server runtime, ensure tables exist safely
if (process.env.NODE_ENV !== "production" || process.env.NEXT_RUNTIME) {
  ensureDbInitialized();
}
