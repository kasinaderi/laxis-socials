/**
 * /api/hermes — Hermes Agent Management API
 *
 * GET  /api/hermes?agentId=fb_jotrainer          — Check Hermes status for one agent
 * GET  /api/hermes                                — Check all agents
 * POST /api/hermes { agentId, provider, apiKey, model } — Configure Hermes for an agent
 * POST /api/hermes { agentId, task }              — Run a Hermes task on a specific agent VM
 */

import { NextRequest, NextResponse } from "next/server";
import {
  installHermesInSandbox,
  configureHermesAgent,
  runHermesTask,
  checkHermesStatus,
  getDefaultHermesConfigForAgent,
  ALL_AGENT_IDS,
  AGENT_NAMES,
  type HermesAgentConfig,
} from "@/lib/hermes";

const campaignId = "default_campaign";

function getActiveSandbox(agentId: string) {
  const activeMap: Map<string, any> = (global as any).__activeSandboxes;
  if (!activeMap) return null;
  return activeMap.get(`${campaignId}_${agentId}`) || null;
}

export async function GET(req: NextRequest) {
  const agentId = req.nextUrl.searchParams.get("agentId");

  const agentsToCheck = agentId
    ? [agentId]
    : [...ALL_AGENT_IDS];

  const results = await Promise.all(
    agentsToCheck.map(async (id) => {
      const sb = getActiveSandbox(id);
      if (!sb) {
        return {
          agentId: id,
          name: AGENT_NAMES[id] || id,
          vmStatus: "standby",
          hermes: { installed: false, configured: false, version: "" },
        };
      }

      const status = await checkHermesStatus(sb);
      return {
        agentId: id,
        name: AGENT_NAMES[id] || id,
        vmStatus: "active",
        hermes: status,
      };
    })
  );

  return NextResponse.json({ agents: results, total: results.length });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agentId, provider, apiKey, model, hermesToken, task, action } = body;

    if (!agentId) {
      return NextResponse.json({ error: "agentId is required" }, { status: 400 });
    }

    const sb = getActiveSandbox(agentId);
    if (!sb) {
      return NextResponse.json(
        { error: `Agent VM for ${agentId} is not currently active. Wake the VM first.` },
        { status: 409 }
      );
    }

    // ── ACTION: configure — set API keys for this agent's Hermes ──
    if (action === "configure" || (provider && apiKey) || action === "auto_configure") {
      const config: HermesAgentConfig = (provider && apiKey)
        ? {
            agentId,
            modelProvider: provider || "gemini",
            apiKey,
            model: model || "gemini-3.5-flash",
          }
        : getDefaultHermesConfigForAgent(agentId);

      // Ensure Hermes is installed and configured with keys
      await installHermesInSandbox(sb, agentId);
      await configureHermesAgent(sb, config);

      return NextResponse.json({
        success: true,
        message: `Hermes configured for ${AGENT_NAMES[agentId] || agentId} with provider: ${config.modelProvider}`,
        agentId,
        provider: config.modelProvider,
        model: config.model || "gemini-3.5-flash",
      });
    }

    // ── ACTION: run task — send a task to Hermes in this VM ──
    if (action === "run" || task) {
      if (!task) {
        return NextResponse.json({ error: "task is required for run action" }, { status: 400 });
      }

      const result = await runHermesTask(sb, task, 120_000);

      return NextResponse.json({
        success: result.success,
        agentId,
        name: AGENT_NAMES[agentId] || agentId,
        summary: result.summary,
        mode: result.mode,
        hasScreenshot: Boolean(result.screenshotB64),
        screenshotDataUrl: result.screenshotB64
          ? `data:image/png;base64,${result.screenshotB64}`
          : null,
      });
    }

    // ── ACTION: install — force reinstall Hermes ──
    if (action === "install") {
      const installResult = await installHermesInSandbox(sb);
      return NextResponse.json(installResult);
    }

    // ── ACTION: status ──
    if (action === "status") {
      const status = await checkHermesStatus(sb);
      return NextResponse.json({
        agentId,
        name: AGENT_NAMES[agentId] || agentId,
        vmStatus: "active",
        hermes: status,
      });
    }

    return NextResponse.json(
      { error: "Unknown action. Use action: 'configure' | 'run' | 'install' | 'status'" },
      { status: 400 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
