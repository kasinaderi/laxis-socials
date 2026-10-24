import { NextResponse } from "next/server";
import { askMasterAgent } from "@/lib/ai";
import { generateSocialImage } from "@/lib/images";
import { db } from "@/db";
import { agentMessages } from "@/db/schema";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function sendTelegramMessage(chatId: number | string, text: string) {
  if (!TELEGRAM_BOT_TOKEN) return;
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
    }),
  }).catch(console.error);
}

async function sendTelegramPhoto(chatId: number | string, photoUrl: string, caption?: string) {
  if (!TELEGRAM_BOT_TOKEN) return;

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
    }).catch(console.error);
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
    }).catch(console.error);
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

    const message = update.message;
    const chatId = message.chat.id;
    const text = message.text || message.caption || "";
    let userImageUrl: string | undefined;

    // Handle photo sent by user on Telegram
    if (message.photo && Array.isArray(message.photo) && message.photo.length > 0) {
      // Get highest resolution photo (last in array)
      const fileId = message.photo[message.photo.length - 1].file_id;
      if (TELEGRAM_BOT_TOKEN) {
        const fileRes = await fetch(
          `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`
        );
        const fileData = await fileRes.json();
        if (fileData.result && fileData.result.file_path) {
          userImageUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${fileData.result.file_path}`;
        }
      }
    }

    // Handle /start command
    if (text === "/start") {
      await sendTelegramMessage(
        chatId,
        `👋 *Welcome to Laxis Socials Master Agent!*\n\nI am your Autonomous Agency Director. You can:\n• Send me instructions or goals\n• Send photos for instant AI visual analysis & critique\n• Ask me to generate social media visuals ("Create an image of...")\n• Request daily status updates on your 6 worker agents\n\nWhat would you like to build today?`
      );
      return NextResponse.json({ ok: true });
    }

    // Process through Master Agent AI Engine with vision
    const masterRes = await askMasterAgent(
      text || (userImageUrl ? "Explain what is in this image" : "Hello"),
      [],
      userImageUrl
    );

    // If an image was requested or generated, send photo
    if (masterRes.mediaUrl) {
      await sendTelegramPhoto(chatId, masterRes.mediaUrl, masterRes.text);
    } else {
      await sendTelegramMessage(chatId, masterRes.text);
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Telegram webhook error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
