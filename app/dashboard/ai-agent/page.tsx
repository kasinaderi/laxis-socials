"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { OfficePreview } from "@/components/OfficePreview";
import { AgentTabs } from "@/components/AgentTabs";
import { CreatePostModal } from "@/components/CreatePostModal";
import {
  Sparkles,
  Bot,
  TrendingUp,
  Briefcase,
  Flame,
  MessageCircle,
  Newspaper,
  BarChart2,
} from "lucide-react";

export default function AIAgentPage() {
  const [agents, setAgents] = useState<any[]>([]);
  const [campaign, setCampaign] = useState<any>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("fb_laxdollar");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const fetchAgents = async () => {
    try {
      const res = await fetch("/api/agents");
      const data = await res.json();
      if (data.agents) setAgents(data.agents);
      if (data.campaign) setCampaign(data.campaign);
    } catch (err) {
      console.error("Agents fetch error:", err);
    }
  };

  useEffect(() => {
    fetchAgents();
    const interval = setInterval(fetchAgents, 10000);
    return () => clearInterval(interval);
  }, []);

  const selectedAgent = agents.find((a) => a.id === selectedAgentId) ||
    agents[0] || {
      id: "fb_laxdollar",
      name: "LAXDOLLAR FB",
      role: "Deriv Trading & laxdollar.site",
      status: "running",
      avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=laxdollar_deriv",
    };

  const agentIcons: Record<string, any> = {
    master: Sparkles,
    fb_laxdollar: TrendingUp,
    fb_jotrainer: Briefcase,
    fb_contentor: Flame,
    ig_real: MessageCircle,
    ig_shader: Newspaper,
    analytics: BarChart2,
  };

  return (
    <div className="flex h-screen bg-slate-100/60 overflow-hidden font-sans">
      <Sidebar campaignName={campaign?.name || "laxis socials"} campaignIcon={campaign?.icon || "☕"} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header
          title="AI Agent Command Center"
          subtitle="Autonomous social agency: LAXDOLLAR FB, JOTRAINER JOBS, CONTENTOR, INSTA REAL & INSTA SHADER"
          onCreatePostClick={() => setIsCreateModalOpen(true)}
        />

        <main className="flex-1 p-4 sm:p-6 overflow-hidden flex flex-col">
          {/* Main 2-Column Split: Active Agent Control Center / Office Preview */}
          <div className="flex-1 flex flex-col xl:flex-row gap-4 sm:gap-5 min-h-0 overflow-hidden">
            {/* Left Column: Vertical Agent Dock + Active Agent Workspace */}
            <div className="flex-1 flex gap-2.5 sm:gap-3.5 h-full min-h-0 min-w-0">
              {/* Vertical Agent Switcher Dock */}
              <div className="flex flex-col gap-1.5 p-1.5 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex-shrink-0 overflow-y-auto">
                {agents.map((agent) => {
                  const isSelected = selectedAgentId === agent.id;
                  const Icon = agentIcons[agent.id] || Bot;
                  return (
                    <button
                      key={agent.id}
                      onClick={() => setSelectedAgentId(agent.id)}
                      title={`${agent.name} — ${agent.role}`}
                      className={`relative w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center transition-all cursor-pointer group ${
                        isSelected
                          ? "bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/25 ring-2 ring-blue-500/30"
                          : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                      }`}
                    >
                      <img
                        src={agent.avatar}
                        alt={agent.name}
                        className={`w-6 h-6 sm:w-7 sm:h-7 object-contain transition-transform ${
                          isSelected ? "scale-110" : ""
                        }`}
                      />
                      {/* Status indicator dot */}
                      <span
                        className={`absolute top-1 right-1 w-2.5 h-2.5 rounded-full border border-white ${
                          agent.status === "running"
                            ? "bg-blue-400 animate-pulse"
                            : agent.status === "done"
                            ? "bg-emerald-400"
                            : "bg-slate-300"
                        }`}
                      />
                    </button>
                  );
                })}
              </div>

              {/* Selected Agent Workspace (Chat, Tasks, Computer / VM Cloud Desktop) */}
              <div className="flex-1 h-full min-h-0 min-w-0">
                <AgentTabs
                  agentId={selectedAgent.id}
                  agentName={selectedAgent.name}
                  agentRole={selectedAgent.role}
                  agentStatus={selectedAgent.status}
                  avatar={selectedAgent.avatar}
                  campaignId={campaign?.id}
                />
              </div>
            </div>

            {/* Right Column: Live Isometric Virtual Office with Seated Animated Characters */}
            <div className="w-full xl:w-[460px] 2xl:w-[540px] flex flex-col h-full min-h-[460px] flex-shrink-0">
              <div className="flex-1 h-full min-h-[460px]">
                <OfficePreview
                  selectedAgentId={selectedAgentId}
                  onSelectAgent={(id) => setSelectedAgentId(id)}
                  officeTheme={campaign?.officeStyle || "wooden-office"}
                  agentStatuses={agents.reduce((acc, a) => ({ ...acc, [a.id]: a.status }), {})}
                />
              </div>
            </div>
          </div>
        </main>
      </div>

      <CreatePostModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onPostCreated={fetchAgents}
        campaignId={campaign?.id}
      />
    </div>
  );
}
