import { NextRequest, NextResponse } from "next/server";
import { getAutoApproveSetting, setAutoApproveSetting } from "@/lib/vault";

export async function GET() {
  const autoApprove = await getAutoApproveSetting();
  return NextResponse.json({ autoApprove });
}

export async function POST(req: NextRequest) {
  try {
    const { autoApprove } = await req.json();
    if (typeof autoApprove !== "boolean") {
      return NextResponse.json({ error: "autoApprove boolean is required" }, { status: 400 });
    }
    const success = await setAutoApproveSetting(autoApprove);
    return NextResponse.json({ success, autoApprove });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
