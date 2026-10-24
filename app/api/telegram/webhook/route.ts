import { NextResponse, after } from "next/server";
import { askMasterAgent } from "@/lib/ai";
import { generateSocialImage } from "@/lib/images";
import { db } from "@/db";
import { agentMessages } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";

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

async function sendTelegramPhoto(chatId: number | string, photoUrl: string, caption?: string) {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    // If photo is a data URL (base64)
    if (photoUrl.startsWith("data:")) {
      const base64Data = photoUrl.replace(/^data:image\/[a-zA-Z0-9.-]+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      const formData = new FormData();
      formData.append("chat_id", String(chatId));
      formData.append("photo", new Blob([buffer], { type: "image/jpeg" }), "visual.jpg");
      if (caption) formData.append("caption", caption.slice(0, 1000));

      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
        method: "POST",
        body: formData,
      });
    } else {
      // If photo is a public HTTP URL
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          photo: photoUrl,
          caption: caption ? caption.slice(0, 1000) : undefined,
        }),
      });
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
    if (!update.message) {
      return NextResponse.json({ ok: true });
    }

    // Suppress Telegram duplicate webhook deliveries
    if (isDuplicateUpdate(update.update_id)) {
      console.log(`[Telegram Webhook] Suppressed duplicate update_id: ${update.update_id}`);
      return NextResponse.json({ ok: true, duplicate: true });
    }

    const message = update.message;
    const chatId = message.chat.id;
    const text = message.text || message.caption || "";

    // Process asynchronously so Telegram gets HTTP 200 OK immediately in <30ms
    after(async () => {
      try {
        // Immediate visual typing feedback
        await sendTelegramChatAction(chatId, "typing");

        // Handle /start command
        if (text === "/start") {
          await sendTelegramMessage(
            chatId,
            `👋 *Welcome to Laxis Socials Master Agent!*\n\nI am your Autonomous Agency Director. You can:\n• Send instructions, goals, or check system status\n• Ask questions about your 6 worker agents & quotas\n• Send photos for instant AI visual critique & feedback\n• Ask to generate social graphics ("Generate an image of...")\n\nWhat are we building today?`
          );
          return;
        }

        let userImageUrl: string | undefined;

        // Handle photo sent by user on Telegram - fetch buffer directly & convert to base64 Data URL
        if (message.photo && Array.isArray(message.photo) && message.photo.length > 0) {
          const fileId = message.photo[message.photo.length - 1].file_id;
          if (TELEGRAM_BOT_TOKEN) {
            try {
              const fileRes = await fetch(
                `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`
              );
              const fileData = await fileRes.json();
              if (fileData.result && fileData.result.file_path) {
                const imgRes = await fetch(
                  `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${fileData.result.file_path}`
                );
                if (imgRes.ok) {
                  const buffer = await imgRes.arrayBuffer();
                  const base64 = Buffer.from(buffer).toString("base64");
                  userImageUrl = `data:image/jpeg;base64,${base64}`;
                }
              }
            } catch (pErr) {
              console.error("[Telegram Webhook] Photo download error:", pErr);
            }
          }
        } else if (message.document && message.document.mime_type?.startsWith("image/")) {
          // Handle uncompressed image files sent as documents
          const fileId = message.document.file_id;
          if (TELEGRAM_BOT_TOKEN) {
            try {
              const fileRes = await fetch(
                `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`
              );
              const fileData = await fileRes.json();
              if (fileData.result && fileData.result.file_path) {
                const imgRes = await fetch(
                  `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${fileData.result.file_path}`
                );
                if (imgRes.ok) {
                  const buffer = await imgRes.arrayBuffer();
                  const base64 = Buffer.from(buffer).toString("base64");
                  const mime = message.document.mime_type || "image/jpeg";
                  userImageUrl = `data:${mime};base64,${base64}`;
                }
              }
            } catch (dErr) {
              console.error("[Telegram Webhook] Document image download error:", dErr);
            }
          }
        }

        const campaignId = "default_campaign";
        const nowIso = new Date().toISOString();

        // Load previous 10 messages from database for conversational context
        const history = (await db
          .select()
          .from(agentMessages)
          .where(and(eq(agentMessages.campaignId, campaignId), eq(agentMessages.agentId, "master")))
          .orderBy(desc(agentMessages.createdAt))
          .limit(10)
          .all())
          .reverse()
          .map((m) => ({ sender: m.sender, text: m.text }));

        // Save incoming user message to database
        const userMsgId = `tg_user_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        await db.insert(agentMessages).values({
          id: userMsgId,
          campaignId,
          agentId: "master",
          sender: "user",
          text: text || (userImageUrl ? "[Attached Photo]" : "Hello"),
          metadata: userImageUrl ? JSON.stringify({ hasMedia: true, platform: "telegram" }) : JSON.stringify({ platform: "telegram" }),
          createdAt: nowIso,
        }).run();

        // Refresh typing indicator before model generation
        await sendTelegramChatAction(chatId, userImageUrl ? "upload_photo" : "typing");

        // Ask Master Agent with live system ground truth, conversation history, and real action execution
        const userPrompt = text || (userImageUrl ? "Explain what is in this image" : "Hello");
        const masterRes = await askMasterAgent(
          userPrompt,
          history,
          userImageUrl,
          undefined,
          undefined,
          `tg_${chatId}`
        );

        // Send Telegram response
        if (masterRes.mediaUrl) {
          await sendTelegramPhoto(chatId, masterRes.mediaUrl, masterRes.text);
        } else {
          await sendTelegramMessage(chatId, masterRes.text);
        }

        // Save Master Agent reply to database
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

    // Return 200 OK to Telegram immediately to prevent timeouts and duplicate retries
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Telegram webhook root error:", error);
    return NextResponse.json({ ok: true });
  }
}
