import { db } from "@/db";
import { agentSandboxes } from "@/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const rows = await db.select().from(agentSandboxes).all();
  console.log("Current DB agentSandboxes:", rows.map(r => ({ agentId: r.agentId, sandboxId: r.sandboxId, status: r.status })));

  const igReal = rows.find(r => r.agentId === "ig_real");
  if (!igReal || !igReal.sandboxId) {
    console.log("Linking permanent sandbox i8bfuknxn4s1imao7tf6a to ig_real...");
    if (!igReal) {
      await db.insert(agentSandboxes).values({
        id: "sb_default_campaign_ig_real",
        campaignId: "default_campaign",
        agentId: "ig_real",
        sandboxId: "i8bfuknxn4s1imao7tf6a",
        status: "paused",
        control: "agent",
        streamUrl: "https://6080-i8bfuknxn4s1imao7tf6a.e2b.app/vnc.html?autoconnect=true&resize=scale",
        viewUrl: "https://6080-i8bfuknxn4s1imao7tf6a.e2b.app/vnc.html?autoconnect=true&resize=scale",
        createdAt: new Date().toISOString(),
        activeAt: new Date().toISOString(),
      }).run();
    } else {
      await db.update(agentSandboxes).set({
        sandboxId: "i8bfuknxn4s1imao7tf6a",
        status: "paused",
        streamUrl: "https://6080-i8bfuknxn4s1imao7tf6a.e2b.app/vnc.html?autoconnect=true&resize=scale",
        viewUrl: "https://6080-i8bfuknxn4s1imao7tf6a.e2b.app/vnc.html?autoconnect=true&resize=scale",
      }).where(eq(agentSandboxes.agentId, "ig_real")).run();
    }
  }

  const igShader = rows.find(r => r.agentId === "ig_shader");
  if (!igShader || !igShader.sandboxId) {
    console.log("Linking permanent sandbox imbvykmhwqxsd21t5b6j3 to ig_shader...");
    if (!igShader) {
      await db.insert(agentSandboxes).values({
        id: "sb_default_campaign_ig_shader",
        campaignId: "default_campaign",
        agentId: "ig_shader",
        sandboxId: "imbvykmhwqxsd21t5b6j3",
        status: "paused",
        control: "agent",
        streamUrl: "https://6080-imbvykmhwqxsd21t5b6j3.e2b.app/vnc.html?autoconnect=true&resize=scale",
        viewUrl: "https://6080-imbvykmhwqxsd21t5b6j3.e2b.app/vnc.html?autoconnect=true&resize=scale",
        createdAt: new Date().toISOString(),
        activeAt: new Date().toISOString(),
      }).run();
    } else {
      await db.update(agentSandboxes).set({
        sandboxId: "imbvykmhwqxsd21t5b6j3",
        status: "paused",
        streamUrl: "https://6080-imbvykmhwqxsd21t5b6j3.e2b.app/vnc.html?autoconnect=true&resize=scale",
        viewUrl: "https://6080-imbvykmhwqxsd21t5b6j3.e2b.app/vnc.html?autoconnect=true&resize=scale",
      }).where(eq(agentSandboxes.agentId, "ig_shader")).run();
    }
  }

  const updated = await db.select().from(agentSandboxes).all();
  console.log("Updated DB agentSandboxes:", updated.map(r => ({ agentId: r.agentId, sandboxId: r.sandboxId, status: r.status })));
}

main().catch(console.error);
