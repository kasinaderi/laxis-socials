import { NextResponse, after } from "next/server";

export const maxDuration = 300;
import { askMasterAgent } from "@/lib/ai";
import { generateSocialImage } from "@/lib/images";
import { db } from "@/db";
import { agentMessages, posts, appConfig } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import {
  queueUserImage,
  getAgentQueuedCount,
  getAutoApproveSetting,
  setAutoApproveSetting,
  setTelegramOwnerChatId,
  AGENT_VAULT_LABELS,
} from "@/lib/vault";
import { executeHermesPublish } from "@/lib/locoagent";
import { tickScheduler } from "@/lib/scheduler";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// In-memory deduplication cache to kill Telegram retry floods & duplicate messages
const processedUpdateIds = new Map<number, number>();

function isDuplicateUpdate(updateId?: number): boolean {
  if (!updateId) return false;
  const now = Date.now();
  // Clear entries older than 10 minutes
  for (const [id, time] of processedUpdateIds.entries()) {
    if (now - time > 10 * 60 * 1000) {
      processedUpdateIds.delete(id);
    }
  }

  if (processedUpdateIds.has(updateId)) {
    return true;
  }
  processedUpdateIds.set(updateId, now);
  return false;
}

async function sendTelegramChatAction(chatId: number | string, action: string = "typing") {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        action,
      }),
    });
  } catch {
    // non-fatal
  }
}

async function sendTelegramMessage(chatId: number | string, text: string) {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
      }),
    });

    // If Markdown parsing fails, fallback to clean raw text
    if (!res.ok) {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
        }),
      });
    }
  } catch (err) {
    console.error("[Telegram send error]:", err);
  }
}

async function sendTelegramInlineKeyboard(chatId: number | string, text: string, inlineKeyboard: any[][]) {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: inlineKeyboard,
        },
      }),
    });
  } catch (err) {
    console.error("[Telegram send keyboard error]:", err);
  }
}

async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
      }),
    });
  } catch {}
}

async function sendTelegramPhoto(chatId: number | string, photoUrl: string, caption?: string) {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    // If photo is a data URL (base64)
    if (photoUrl.startsWith("data:")) {
      const mimeMatch = photoUrl.match(/^data:(image\/[a-zA-Z0-9.-]+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
      const ext = mimeType.includes("jpeg") || mimeType.includes("jpg") ? "jpg" : "png";
      const base64Data = photoUrl.replace(/^data:image\/[a-zA-Z0-9.-]+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      const formData = new FormData();
      formData.append("chat_id", String(chatId));
      formData.append("photo", new Blob([buffer], { type: mimeType }), `screenshot.${ext}`);
      if (caption) formData.append("caption", caption.slice(0, 1000));

      const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
        method: "POST",
        body: formData,
      });
      const resJson = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[Telegram photo error]:", resJson);
        if (caption) {
          await sendTelegramMessage(chatId, caption);
        }
      }
    } else {
      // If photo is a public HTTP URL
      const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          photo: photoUrl,
          caption: caption ? caption.slice(0, 1000) : undefined,
        }),
      });
      const resJson = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[Telegram photo error]:", resJson);
        if (caption) {
          await sendTelegramMessage(chatId, caption);
        }
      }
    }
  } catch (err) {
    console.error("[Telegram photo error]:", err);
    if (caption) {
      await sendTelegramMessage(chatId, caption);
    }
  }
}

export async function GET(req: Request) {
  return NextResponse.json({
    status: "active",
    hasToken: Boolean(TELEGRAM_BOT_TOKEN),
    info: "Laxis Socials Master Agent Telegram Webhook Endpoint",
  });
}

export async function POST(req: Request) {
  try {
    const update = await req.json();

    // ── 1. HANDLE INLINE KEYBOARD ACTIONS (Callback Queries) ─────────────────
    if (update.callback_query) {
      const cb = update.callback_query;
      const data = cb.data || "";
      const chatId = cb.message?.chat?.id;
      const callbackQueryId = cb.id;

      after(async () => {
        try {
          if (chatId) await setTelegramOwnerChatId(chatId);

          // ACTION: Save pending photo to specific agent's Image Vault
          if (data.startsWith("vault_")) {
            const agentId = data.replace("vault_", "");
            const label = AGENT_VAULT_LABELS[agentId] || agentId;
            const pendingKey = `tg_pending_img_${chatId}`;
            const row = await db.select().from(appConfig).where(eq(appConfig.key, pendingKey)).get();

            if (row && row.value) {
              const res = await queueUserImage(agentId, row.value, "Telegram Photo Drop");
              await answerCallbackQuery(callbackQueryId, `Saved to ${label}!`);
              await sendTelegramMessage(
                chatId,
                `✅ *Saved to ${label}'s Image Vault!*\n\nCurrently *${res.queuedCount} photo(s)* queued in this agent's vault.\nNext time ${label} runs its scheduled post, it will use your photo with a custom persona caption instead of generating one!`
              );
              await db.delete(appConfig).where(eq(appConfig.key, pendingKey)).run();
            } else {
              await answerCallbackQuery(callbackQueryId, "Photo expired. Please re-send.");
            }
          }

          // ACTION: Approve post and schedule it
          else if (data.startsWith("approve_")) {
            const postId = data.replace("approve_", "");
            await db.update(posts)
              .set({ status: "scheduled" })
              .where(eq(posts.id, postId))
              .run();
            await answerCallbackQuery(callbackQueryId, "Post Approved!");
            await sendTelegramMessage(chatId, `✅ *Post Approved!* It has been scheduled and will publish automatically at its time.`);
          }

          // ACTION: Publish post immediately via Locoagent
          else if (data.startsWith("publish_")) {
            const postId = data.replace("publish_", "");
            await answerCallbackQuery(callbackQueryId, "Publishing now...");
            await sendTelegramMessage(chatId, `⚡ *Publishing now via Locoagent...*`);
            const pubRes = await executeHermesPublish(postId);
            if (pubRes?.success) {
              await sendTelegramMessage(chatId, `🎉 *Post Published Successfully!* ${pubRes.publishedUrl ? `[View Post](${pubRes.publishedUrl})` : "Live on social media."}`);
            } else {
              await sendTelegramMessage(chatId, `⚠️ Publish notice: ${pubRes?.error || "Done, check connected accounts"}`);
            }
          }

          // ACTION: Reject post
          else if (data.startsWith("reject_")) {
            const postId = data.replace("reject_", "");
            await db.delete(posts).where(eq(posts.id, postId)).run();
            await answerCallbackQuery(callbackQueryId, "Draft Rejected");
            await sendTelegramMessage(chatId, `🗑️ *Post Draft Rejected and removed from queue.*`);
          }

          // ACTION: Toggle Auto-Approve
          else if (data === "autoapprove_on") {
            await setAutoApproveSetting(true);
            await answerCallbackQuery(callbackQueryId, "Auto-Approve Enabled");
            await sendTelegramMessage(chatId, `⚙️ *Auto-Approve is now ON!* All newly generated posts will be approved & scheduled automatically without asking.`);
          } else if (data === "autoapprove_off") {
            await setAutoApproveSetting(false);
            await answerCallbackQuery(callbackQueryId, "Auto-Approve Disabled");
            await sendTelegramMessage(chatId, `⏸️ *Auto-Approve is now OFF.* All newly generated posts will wait for your thumb-up approval.`);
          }
        } catch (err: any) {
          console.error("[Telegram Callback Error]:", err);
        }
      });

      return NextResponse.json({ ok: true });
    }

    // ── 2. HANDLE REGULAR MESSAGES & PHOTOS ──────────────────────────────────
    if (!update.message) {
      return NextResponse.json({ ok: true });
    }

    if (isDuplicateUpdate(update.update_id)) {
      console.log(`[Telegram Webhook] Suppressed duplicate update_id: ${update.update_id}`);
      return NextResponse.json({ ok: true, duplicate: true });
    }

    const message = update.message;
    const chatId = message.chat.id;
    const text = (message.text || message.caption || "").trim();

    after(async () => {
      try {
        await setTelegramOwnerChatId(chatId);
        await sendTelegramChatAction(chatId, "typing");

        // Command: /start
        if (text === "/start") {
          const autoApprove = await getAutoApproveSetting();
          await sendTelegramMessage(
            chatId,
            `👋 *Welcome to Laxis Socials Master Director!*\n\n` +
            `Here are your superpowers:\n` +
            `• *Send any photo*: Directly queues into an agent's personal Image Vault so it posts your photos with custom captions!\n` +
            `• *Review & Approve*: Get instant cards to approve or publish posts with 1 tap\n` +
            `• */autoapprove*: Toggle auto-approval ON or OFF (Current: *${autoApprove ? "ON ✅" : "OFF ⏸️"}*)\n` +
            `• */vault*: View how many photos each agent has waiting in its store\n` +
            `• */pending*: View posts waiting for your approval right now\n` +
            `• */autopilot*: Run scheduler immediately via Hermes to publish due posts\n\n` +
            `You can also chat with me naturally to give any instruction to your 6 agents!`
          );
          return;
        }

        // Command: /autoapprove
        if (text.startsWith("/autoapprove")) {
          const current = await getAutoApproveSetting();
          const next = !current;
          await setAutoApproveSetting(next);
          await sendTelegramMessage(
            chatId,
            `⚙️ *Auto-Approve Setting Updated!*\n\nStatus is now: *${next ? "ON ✅ (All posts publish automatically)" : "OFF ⏸️ (Posts wait for your review)"}*`
          );
          return;
        }

        // Command: /vault
        if (text.startsWith("/vault")) {
          const summaryLines: string[] = [];
          for (const [key, label] of Object.entries(AGENT_VAULT_LABELS)) {
            const count = await getAgentQueuedCount(key);
            summaryLines.push(`• *${label}*: ${count} queued photo(s)`);
          }
          await sendTelegramMessage(
            chatId,
            `📦 *Agent Image Vault Status:*\n\n${summaryLines.join("\n")}\n\n_Tip: Send any photo here to queue it for an agent!_`
          );
          return;
        }

        // Command: /pending
        if (text.startsWith("/pending")) {
          const pending = await db.select().from(posts).where(eq(posts.status, "pending_approval")).limit(5).all();
          if (pending.length === 0) {
            await sendTelegramMessage(chatId, `✨ *No posts pending approval!* Everything is up to date.`);
            return;
          }

          await sendTelegramMessage(chatId, `📋 *Found ${pending.length} post(s) waiting for approval:*`);
          for (const p of pending) {
            const media = JSON.parse(p.mediaUrls || "[]");
            const keyboard = [
              [
                { text: "✅ Approve & Schedule", callback_data: `approve_${p.id}` },
                { text: "⚡ Publish Now", callback_data: `publish_${p.id}` },
              ],
              [
                { text: "🗑️ Reject", callback_data: `reject_${p.id}` },
              ],
            ];
            await sendTelegramInlineKeyboard(
              chatId,
              `📌 *${p.title}*\n_${p.caption.slice(0, 180)}..._\nScheduled for: ${p.scheduledAt ? new Date(p.scheduledAt).toLocaleTimeString() : "Next Slot"}`,
              keyboard
            );
          }
          return;
        }

        // Command: /autopilot or /tick
        if (text.startsWith("/autopilot") || text.startsWith("/tick")) {
          await sendTelegramMessage(chatId, `🔄 *Running Autopilot Tick via Hermes...* Checking scheduled posts & tasks.`);
          try {
            const tickRes = await tickScheduler();
            await sendTelegramMessage(
              chatId,
              `✅ *Autopilot Tick Finished!*\n\n• Published: *${tickRes.publishedCount}* post(s)\n• Tasks processed: *${tickRes.tasksRunCount}* task(s)`
            );
          } catch (tErr: any) {
            await sendTelegramMessage(chatId, `⚠️ Autopilot Notice: ${tErr?.message || "Check server logs"}`);
          }
          return;
        }

        let userImageUrl: string | undefined;

        // Download user photo if sent
        if (message.photo && Array.isArray(message.photo) && message.photo.length > 0) {
          const fileId = message.photo[message.photo.length - 1].file_id;
          if (TELEGRAM_BOT_TOKEN) {
            try {
              const fileRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`);
              const fileData = await fileRes.json();
              if (fileData.result?.file_path) {
                const imgRes = await fetch(`https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${fileData.result.file_path}`);
                if (imgRes.ok) {
                  const buffer = await imgRes.arrayBuffer();
                  userImageUrl = `data:image/jpeg;base64,${Buffer.from(buffer).toString("base64")}`;
                }
              }
            } catch (pErr) {
              console.error("[Telegram Webhook] Photo download error:", pErr);
            }
          }
        } else if (message.document && message.document.mime_type?.startsWith("image/")) {
          const fileId = message.document.file_id;
          if (TELEGRAM_BOT_TOKEN) {
            try {
              const fileRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`);
              const fileData = await fileRes.json();
              if (fileData.result?.file_path) {
                const imgRes = await fetch(`https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${fileData.result.file_path}`);
                if (imgRes.ok) {
                  const buffer = await imgRes.arrayBuffer();
                  const mime = message.document.mime_type || "image/jpeg";
                  userImageUrl = `data:${mime};base64,${Buffer.from(buffer).toString("base64")}`;
                }
              }
            } catch (dErr) {
              console.error("[Telegram Webhook] Document image error:", dErr);
            }
          }
        }

        // ── 3. IF A PHOTO WAS RECEIVED: ROUTE TO AGENT IMAGE VAULT ───────────
        if (userImageUrl) {
          let targetedAgentId: string | null = null;
          const lower = text.toLowerCase();
          if (lower.includes("laxdollar") || lower.includes("trading") || lower.includes("deriv")) {
            targetedAgentId = "fb_laxdollar";
          } else if (lower.includes("jotrainer") || lower.includes("job") || lower.includes("gig") || lower.includes("remote")) {
            targetedAgentId = "fb_jotrainer";
          } else if (lower.includes("contentor") || lower.includes("sheng") || lower.includes("comedy") || lower.includes("meme")) {
            targetedAgentId = "fb_contentor";
          } else if (lower.includes("shader") || lower.includes("shade") || lower.includes("tea")) {
            targetedAgentId = "ig_shader";
          } else if (lower.includes("real") || lower.includes("confession") || lower.includes("drama")) {
            targetedAgentId = "ig_real";
          }

          if (targetedAgentId) {
            const res = await queueUserImage(targetedAgentId, userImageUrl, text || "Telegram Photo Drop");
            const label = AGENT_VAULT_LABELS[targetedAgentId] || targetedAgentId;
            await sendTelegramMessage(
              chatId,
              `✅ *Photo Saved to ${label}'s Image Vault!*\n\nCurrently *${res.queuedCount} photo(s)* queued for this agent.\nWhen its scheduled post time arrives, it will use your photo with a custom persona caption instead of generating one!`
            );
            return;
          }

          // If no specific agent was mentioned in the caption, show inline keyboard selection buttons
          const pendingKey = `tg_pending_img_${chatId}`;
          const nowIso = new Date().toISOString();
          await db.insert(appConfig).values({
            key: pendingKey,
            value: userImageUrl,
            updatedAt: nowIso,
          }).onConflictDoUpdate({
            target: appConfig.key,
            set: { value: userImageUrl, updatedAt: nowIso },
          }).run();

          await sendTelegramInlineKeyboard(
            chatId,
            `📸 *Personal Photo Received!*\n\nWhich agent's Image Vault would you like to save this photo to? Next time that agent posts, it will use your photo instead of generating an AI image!`,
            [
              [
                { text: "💰 LAXDOLLAR (Trading)", callback_data: "vault_fb_laxdollar" },
                { text: "💼 JOTRAINER (Jobs)", callback_data: "vault_fb_jotrainer" },
              ],
              [
                { text: "🎭 CONTENTOR (Comedy)", callback_data: "vault_fb_contentor" },
                { text: "📸 IG REAL (Confessions)", callback_data: "vault_ig_real" },
              ],
              [
                { text: "🎨 IG SHADER (The Shade)", callback_data: "vault_ig_shader" },
              ],
            ]
          );
          return;
        }

        // ── 4. REGULAR CONVERSATIONAL CHAT WITH MASTER AGENT ─────────────────
        const campaignId = "default_campaign";
        const nowIso = new Date().toISOString();

        const history = (await db
          .select()
          .from(agentMessages)
          .where(and(eq(agentMessages.campaignId, campaignId), eq(agentMessages.agentId, "master")))
          .orderBy(desc(agentMessages.createdAt))
          .limit(10)
          .all())
          .reverse()
          .map((m) => ({ sender: m.sender, text: m.text }));

        const userMsgId = `tg_user_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        await db.insert(agentMessages).values({
          id: userMsgId,
          campaignId,
          agentId: "master",
          sender: "user",
          text: text || "Hello",
          metadata: JSON.stringify({ platform: "telegram" }),
          createdAt: nowIso,
        }).run();

        // Send immediate typing indicator & acknowledgment for operational tasks so user is never left waiting in silence
        sendTelegramChatAction(chatId, "typing").catch(() => {});
        const isTaskCommand = /turn\s+on|wake|search|go\s+to|visit|browse|github|youtube|insta|facebook|power|pause|sleep/i.test(text || "");
        if (isTaskCommand) {
          sendTelegramMessage(chatId, "⚡ AGENTLAX received your objective. Dispatching to workstation...").catch(() => {});
        }

        const masterRes = await askMasterAgent(
          text || "Hello",
          history,
          undefined,
          undefined,
          undefined,
          `tg_${chatId}`
        );

        if (masterRes.mediaUrl) {
          await sendTelegramPhoto(chatId, masterRes.mediaUrl, masterRes.text);
        } else {
          await sendTelegramMessage(chatId, masterRes.text);
        }

        const agentMsgId = `tg_agent_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        await db.insert(agentMessages).values({
          id: agentMsgId,
          campaignId,
          agentId: "master",
          sender: "master",
          text: masterRes.text,
          metadata: masterRes.mediaUrl ? JSON.stringify({ mediaUrl: masterRes.mediaUrl, platform: "telegram" }) : JSON.stringify({ platform: "telegram" }),
          createdAt: new Date().toISOString(),
        }).run();

      } catch (err: any) {
        console.error("[Telegram webhook after() error]:", err);
        await sendTelegramMessage(chatId, "Sorry, I ran into a brief hiccup. Could you try asking again?");
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Telegram webhook root error:", error);
    return NextResponse.json({ ok: true });
  }
}
