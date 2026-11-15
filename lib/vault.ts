import { db } from "@/db";
import { agentDeliverables, appConfig, posts } from "@/db/schema";
import { eq, and, asc, desc } from "drizzle-orm";

export interface VaultImageItem {
  id: string;
  agentId: string;
  url: string;
  name: string;
  status: "queued" | "used";
  createdAt: string;
}

/**
 * Queue a personal user image into an agent's personal Image Vault.
 */
export async function queueUserImage(
  agentId: string,
  url: string,
  name?: string,
  campaignId: string = "default_campaign"
): Promise<{ success: boolean; id: string; queuedCount: number }> {
  const id = `vault_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  await db.insert(agentDeliverables).values({
    id,
    campaignId,
    agentId,
    type: "user_image_vault",
    name: name || "Personal User Image",
    url,
    content: "queued",
    createdAt: now,
  }).run();

  const queuedCount = await getAgentQueuedCount(agentId);
  return { success: true, id, queuedCount };
}

/**
 * Get count of queued personal images waiting for an agent.
 */
export async function getAgentQueuedCount(agentId: string): Promise<number> {
  try {
    const items = await db.select()
      .from(agentDeliverables)
      .where(and(
        eq(agentDeliverables.agentId, agentId),
        eq(agentDeliverables.type, "user_image_vault"),
        eq(agentDeliverables.content, "queued")
      ))
      .all();
    return items.length;
  } catch {
    return 0;
  }
}

/**
 * Pop the oldest queued image for an agent and mark it as 'used'.
 * If no image is queued, returns null so the system falls back to AI generation.
 */
export async function popNextQueuedImage(agentId: string): Promise<{ url: string; id: string } | null> {
  try {
    const queued = await db.select()
      .from(agentDeliverables)
      .where(and(
        eq(agentDeliverables.agentId, agentId),
        eq(agentDeliverables.type, "user_image_vault"),
        eq(agentDeliverables.content, "queued")
      ))
      .orderBy(asc(agentDeliverables.createdAt))
      .limit(1)
      .get();

    if (queued && queued.url) {
      await db.update(agentDeliverables)
        .set({ content: "used" })
        .where(eq(agentDeliverables.id, queued.id))
        .run();

      console.log(`[Image Vault] Popped personal user image for ${agentId} (ID: ${queued.id})`);
      return { url: queued.url, id: queued.id };
    }
  } catch (err) {
    console.warn(`[Image Vault] Notice checking queued images for ${agentId}:`, err);
  }
  return null;
}

/**
 * List all images in the vault for an agent or all agents.
 */
export async function listVaultImages(agentId?: string): Promise<VaultImageItem[]> {
  try {
    const rows = agentId
      ? await db.select()
          .from(agentDeliverables)
          .where(and(
            eq(agentDeliverables.agentId, agentId),
            eq(agentDeliverables.type, "user_image_vault")
          ))
          .orderBy(desc(agentDeliverables.createdAt))
          .all()
      : await db.select()
          .from(agentDeliverables)
          .where(eq(agentDeliverables.type, "user_image_vault"))
          .orderBy(desc(agentDeliverables.createdAt))
          .all();

    return rows.map((r) => ({
      id: r.id,
      agentId: r.agentId,
      url: r.url || "",
      name: r.name,
      status: (r.content === "queued" ? "queued" : "used") as "queued" | "used",
      createdAt: r.createdAt,
    }));
  } catch (err) {
    console.warn("[Image Vault] list error:", err);
    return [];
  }
}

/**
 * Delete a photo from the vault.
 */
export async function deleteVaultImage(id: string): Promise<boolean> {
  try {
    await db.delete(agentDeliverables).where(eq(agentDeliverables.id, id)).run();
    return true;
  } catch {
    return false;
  }
}

/**
 * Check the global Auto-Approve setting.
 * When true: newly scheduled posts are marked 'scheduled' (auto-approved).
 * When false: newly scheduled posts are marked 'pending_approval' (awaiting user review).
 */
export async function getAutoApproveSetting(): Promise<boolean> {
  try {
    const row = await db.select().from(appConfig).where(eq(appConfig.key, "auto_approve_posts")).get();
    if (!row) return false; // Default: OFF (posts wait for user review)
    return row.value === "true";
  } catch {
    return false;
  }
}

export async function setAutoApproveSetting(enabled: boolean): Promise<boolean> {
  try {
    const now = new Date().toISOString();
    const value = enabled ? "true" : "false";
    await db.insert(appConfig).values({
      key: "auto_approve_posts",
      value,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: appConfig.key,
      set: { value, updatedAt: now }
    }).run();

    // If enabled, automatically approve any currently pending posts
    if (enabled) {
      await db.update(posts)
        .set({ status: "scheduled" })
        .where(eq(posts.status, "pending_approval"))
        .run();
    }

    return true;
  } catch (err) {
    console.error("[Auto-Approve Setting] Update error:", err);
    return false;
  }
}

/**
 * Save & retrieve the Telegram chat ID of the user for notifications.
 */
export async function getTelegramOwnerChatId(): Promise<string | null> {
  try {
    const row = await db.select().from(appConfig).where(eq(appConfig.key, "telegram_owner_chat_id")).get();
    return row?.value || null;
  } catch {
    return null;
  }
}

export async function setTelegramOwnerChatId(chatId: string | number): Promise<void> {
  try {
    const now = new Date().toISOString();
    const value = String(chatId);
    await db.insert(appConfig).values({
      key: "telegram_owner_chat_id",
      value,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: appConfig.key,
      set: { value, updatedAt: now }
    }).run();
  } catch {}
}

export const AGENT_VAULT_LABELS: Record<string, string> = {
  fb_laxdollar: "LAXDOLLAR (Trading & Online Hustles)",
  fb_jotrainer: "JOTRAINER (Pinterest Marketing)",
  fb_contentor: "CONTENTOR (Viral Comedy)",
  ig_real: "INSTA REAL (Aesthetics)",
  ig_shader: "INSTA SHADER (Motion & Art)",
};

/**
 * Send an interactive Telegram card to the owner asking for approval of a draft post.
 */
export async function notifyTelegramApproval(post: {
  id: string;
  title: string;
  caption: string;
  mediaUrl?: string;
  agentId?: string;
  scheduledAt?: string;
}): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = await getTelegramOwnerChatId();
  if (!token || !chatId) return;

  const agentLabel = post.agentId ? (AGENT_VAULT_LABELS[post.agentId] || post.agentId) : "Worker Agent";
  const text = `📢 *NEW POST DRAFT WAITING FOR YOUR APPROVAL*\n\n` +
    `👤 *Agent*: ${agentLabel}\n` +
    `📌 *Title*: ${post.title}\n` +
    `⏰ *Scheduled For*: ${post.scheduledAt ? new Date(post.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Next Slot"}\n\n` +
    `📝 *Caption Preview*:\n_${post.caption.slice(0, 260)}..._\n\n` +
    `👇 *Tap an action below to review & publish:*`;

  const keyboard = [
    [
      { text: "✅ Approve & Schedule", callback_data: `approve_${post.id}` },
      { text: "⚡ Publish Now", callback_data: `publish_${post.id}` },
    ],
    [
      { text: "🗑️ Reject Draft", callback_data: `reject_${post.id}` },
      { text: "⚙️ Auto-Approve ALL", callback_data: `autoapprove_on` },
    ],
  ];

  try {
    if (post.mediaUrl && !post.mediaUrl.endsWith(".mp4") && !post.mediaUrl.includes("video")) {
      if (post.mediaUrl.startsWith("data:")) {
        const base64Data = post.mediaUrl.replace(/^data:image\/[a-zA-Z0-9.-]+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");
        const formData = new FormData();
        formData.append("chat_id", String(chatId));
        formData.append("photo", new Blob([buffer], { type: "image/jpeg" }), "draft.jpg");
        formData.append("caption", text.slice(0, 1024));
        formData.append("parse_mode", "Markdown");
        formData.append("reply_markup", JSON.stringify({ inline_keyboard: keyboard }));

        await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
          method: "POST",
          body: formData,
        });
        return;
      } else {
        await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            photo: post.mediaUrl,
            caption: text.slice(0, 1024),
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: keyboard },
          }),
        });
        return;
      }
    }
  } catch (err) {
    console.warn("[Telegram Approval Photo Error]:", err);
  }

  // Fallback to Markdown message with keyboard
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: keyboard },
      }),
    });
  } catch {}
}
