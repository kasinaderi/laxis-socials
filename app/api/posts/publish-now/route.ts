import { NextResponse } from "next/server";
import { executeHermesPublish } from "@/lib/locoagent";

export async function POST(req: Request) {
  try {
    const { postId } = await req.json();
    if (!postId) {
      return NextResponse.json({ error: "Post ID is required" }, { status: 400 });
    }

    const result = await executeHermesPublish(postId);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
