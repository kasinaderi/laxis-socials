import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: text("created_at").notNull(),
});

export const campaigns = sqliteTable("campaigns", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  icon: text("icon").notNull().default("🚀"),
  officeStyle: text("office_style").notNull().default("modern-office"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  description: text("description").notNull(),
  avatar: text("avatar").notNull(),
  color: text("color").notNull().default("blue"),
  status: text("status").notNull().default("idle"), // 'idle', 'running', 'done', 'paused'
  niche: text("niche"),
  platform: text("platform"),
  targetGroups: text("target_groups"),
  cookieStatus: text("cookie_status").default("ready"),
  currentTask: text("current_task"),
  activeAt: text("active_at"),
});

export const agentSandboxes = sqliteTable("agent_sandboxes", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull(),
  agentId: text("agent_id").notNull(),
  sandboxId: text("sandbox_id"),
  status: text("status").notNull().default("none"), // 'none', 'starting', 'running', 'paused', 'killed'
  control: text("control").notNull().default("agent"), // 'agent', 'user'
  streamUrl: text("stream_url"),
  viewUrl: text("view_url"),
  activeAt: text("active_at"),
  createdAt: text("created_at").notNull(),
});

export const agentPlans = sqliteTable("agent_plans", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull(),
  title: text("title").notNull(),
  request: text("request").notNull(),
  status: text("status").notNull().default("in_progress"), // 'in_progress', 'awaiting_user', 'completed', 'failed', 'cancelled'
  summary: text("summary"),
  error: text("error"),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
});

export const agentTasks = sqliteTable("agent_tasks", {
  id: text("id").primaryKey(),
  planId: text("plan_id"),
  campaignId: text("campaign_id").notNull(),
  agentId: text("agent_id").notNull(),
  position: integer("position").notNull().default(0),
  title: text("title").notNull(),
  instructions: text("instructions").notNull(),
  dependsOn: text("depends_on").notNull().default("[]"), // JSON array
  status: text("status").notNull().default("pending"), // 'pending', 'in_progress', 'in_review', 'awaiting_input', 'completed', 'failed', 'cancelled'
  output: text("output"),
  question: text("question"),
  review: text("review"),
  error: text("error"),
  startedAt: text("started_at"),
  scheduledAt: text("scheduled_at"),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
});

export const agentMessages = sqliteTable("agent_messages", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull(),
  agentId: text("agent_id").notNull(),
  sender: text("sender").notNull(), // 'user', 'master', 'research', 'creator', 'scheduler', 'analytics'
  text: text("text").notNull(),
  metadata: text("metadata"), // JSON
  createdAt: text("created_at").notNull(),
});

export const posts = sqliteTable("posts", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull(),
  title: text("title").notNull(),
  caption: text("caption").notNull(),
  hashtags: text("hashtags").notNull().default("[]"), // JSON string
  mediaUrls: text("media_urls").notNull().default("[]"), // JSON string
  platforms: text("platforms").notNull().default("[]"), // JSON string
  targetGroups: text("target_groups").notNull().default("[]"), // JSON string for Locoagent group target
  status: text("status").notNull().default("draft"), // 'draft', 'scheduled', 'published', 'failed'
  scheduledAt: text("scheduled_at"),
  publishedAt: text("published_at"),
  analytics: text("analytics").notNull().default('{"views":0,"likes":0,"comments":0,"shares":0}'),
  locoagentLog: text("locoagent_log"),
  createdAt: text("created_at").notNull(),
});

export const socialAccounts = sqliteTable("social_accounts", {
  id: text("id").primaryKey(),
  platform: text("platform").notNull(), // 'facebook', 'instagram', 'reddit', 'x', 'linkedin', 'tiktok', 'youtube'
  accountName: text("account_name").notNull(),
  profileUrl: text("profile_url"),
  isGroup: integer("is_group").notNull().default(0), // 1 for community/group
  groupId: text("group_id"),
  groupName: text("group_name"),
  status: text("status").notNull().default("connected"), // 'connected', 'needs_login', 'error'
  cookiesEncrypted: text("cookies_encrypted"),
  lastSyncedAt: text("last_synced_at"),
  createdAt: text("created_at").notNull(),
});

export const agentDeliverables = sqliteTable("agent_deliverables", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull(),
  taskId: text("task_id"),
  agentId: text("agent_id").notNull(),
  type: text("type").notNull(), // 'image', 'copy', 'research', 'report'
  name: text("name").notNull(),
  url: text("url"),
  content: text("content"),
  createdAt: text("created_at").notNull(),
});

export const officeLayouts = sqliteTable("office_layouts", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull(),
  layoutData: text("layout_data").notNull(),
  updatedAt: text("updated_at").notNull(),
});
