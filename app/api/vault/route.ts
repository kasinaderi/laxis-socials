import { NextRequest, NextResponse } from "next/server";
import {
  queueUserImage,
  listVaultImages,
  deleteVaultImage,
  getAutoApproveSetting,
  getAgentQueuedCount,
  AGENT_VAULT_LABELS,
} from "@/lib/vault";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get("agentId") || undefined;

    const images = await listVaultImages(agentId);
    const autoApprove = await getAutoApproveSetting();

    const counts: Record<string, number> = {};
    for (const key of Object.keys(AGENT_VAULT_LABELS)) {
      counts[key] = await getAgentQueuedCount(key);
    }

    return NextResponse.json({
      images,
      autoApprove,
      counts,
      agentLabels: AGENT_VAULT_LABELS,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agentId, url, name } = body;

    if (!agentId || !url) {
      return NextResponse.json({ error: "agentId and url are required" }, { status: 400 });
    }

    const res = await queueUserImage(agentId, url, name);
    return NextResponse.json(res);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const ok = await deleteVaultImage(id);
    return NextResponse.json({ success: ok, deletedId: id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
