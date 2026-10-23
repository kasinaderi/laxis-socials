import { NextResponse } from "next/server";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { executeLocoagentPublish } from "@/lib/locoagent";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get("campaignId") || "default_campaign";
    const status = searchParams.get("status");

    const allPosts = await db
      .select()
      .from(posts)
      .where(eq(posts.campaignId, campaignId))
      .orderBy(desc(posts.createdAt))
      .all();

    const filtered = status ? allPosts.filter((p) => p.status === status) : allPosts;

    return NextResponse.json({ posts: filtered });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      title,
      caption,
      hashtags = [],
      mediaUrls = [],
      platforms = ["instagram"],
      targetGroups = [],
      scheduledAt,
      campaignId = "default_campaign",
      publishNow = false,
    } = body;

    const id = `post_${Date.now()}`;
    const now = new Date().toISOString();

    await db.insert(posts)
      .values({
        id,
        campaignId,
        title: title || "Untitled Post",
        caption: caption || "",
        hashtags: JSON.stringify(hashtags),
        mediaUrls: JSON.stringify(mediaUrls),
        platforms: JSON.stringify(platforms),
        targetGroups: JSON.stringify(targetGroups),
        status: scheduledAt ? "scheduled" : "draft",
        scheduledAt: scheduledAt || null,
        createdAt: now,
      })
      .run();

    if (publishNow) {
      const pubResult = await executeLocoagentPublish(id);
      return NextResponse.json({ success: true, post: { id, status: "published" }, pubResult });
    }

    return NextResponse.json({ success: true, post: { id, title, status: scheduledAt ? "scheduled" : "draft" } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, title, caption, hashtags, mediaUrls, platforms, targetGroups, scheduledAt, status } = body;

    if (!id) {
      return NextResponse.json({ error: "Post ID is required" }, { status: 400 });
    }

    await db.update(posts)
      .set({
        title,
        caption,
        hashtags: hashtags ? JSON.stringify(hashtags) : undefined,
        mediaUrls: mediaUrls ? JSON.stringify(mediaUrls) : undefined,
        platforms: platforms ? JSON.stringify(platforms) : undefined,
        targetGroups: targetGroups ? JSON.stringify(targetGroups) : undefined,
        scheduledAt,
        status: status || (scheduledAt ? "scheduled" : "draft"),
      })
      .where(eq(posts.id, id))
      .run();

    return NextResponse.json({ success: true, updatedId: id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "Post ID is required" }, { status: 400 });
    }
    await db.delete(posts).where(eq(posts.id, id)).run();
    return NextResponse.json({ success: true, deletedId: id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
