"use client";

import { useState } from "react";
import Image from "next/image";
import { AnimatedCharacter } from "./AnimatedCharacter";
import { ShieldCheck, Zap, ChevronRight, Info } from "lucide-react";

export interface AgentOfficePlacement {
  id: string;
  name: string;
  role: string;
  emoji: string;
  niche: string;
  target: string;
  dailyPosts: string;
  seatNumber: 1 | 2 | 3 | 4;
  zone: "red" | "yellow" | "green" | "blue";
  zoneLabel: string;
  coords: { leftPercent: number; topPercent: number; widthPercent: number };
}

export interface OfficePreviewProps {
  selectedAgentId?: string;
  onSelectAgent?: (agentId: string) => void;
  officeTheme?: "wooden-office" | "modern-office";
  agentStatuses?: Record<string, "idle" | "running" | "done" | "paused">;
}

export function OfficePreview({
  selectedAgentId = "fb_laxdollar",
  onSelectAgent,
  officeTheme = "wooden-office",
  agentStatuses = {},
}: OfficePreviewProps) {
  const [hoveredAgentId, setHoveredAgentId] = useState<string | null>(null);

  // Exact coordinates matching the user's color-circled blueprint:
  // Red: Master Agent (center hallway floor)
  // Yellow: 3x Facebook Agents (right-side floor)
  // Green: 2x Instagram Agents (bottom-left floor)
  // Blue: Analytics Agent (bottom-right floor/drawer)
  const AGENT_PLACEMENTS: AgentOfficePlacement[] = [
    {
      id: "master",
      name: "Master Agent",
      role: "Campaign Orchestrator & Director",
      emoji: "👑",
      niche: "Autonomous Daily Schedule & Cross-Agent Coordination",
      target: "All 6 Agents & Sandboxes",
      dailyPosts: "Decides 3-8 posts/day per agent (Randomized Human Times)",
      seatNumber: 1,
      zone: "red",
      zoneLabel: "Master Control Zone",
      // Ground-anchored in the center aisle
      coords: { leftPercent: 54.7, topPercent: 53.2, widthPercent: 10.5 },
    },
    {
      id: "fb_laxdollar",
      name: "LAXDOLLAR FB",
      role: "Deriv Trading & laxdollar.site Marketer",
      emoji: "📈",
      niche: "Deriv Boom & Crash, Synthetic Indices & Money Memes",
      target: "laxdollar.site & 3x FB Trading Groups",
      dailyPosts: "3-8 posts/day (Dedicated Sandbox)",
      seatNumber: 3,
      zone: "yellow",
      zoneLabel: "Facebook Agency Zone",
      // Ground-anchored on the floor to the right
      coords: { leftPercent: 78.5, topPercent: 65.0, widthPercent: 11.0 },
    },
    {
      id: "fb_jotrainer",
      name: "JOTRAINER JOBS",
      role: "Microwork & AI Training Jobs Scout",
      emoji: "💼",
      niche: "Remote AI Annotation, Outlier & Remotasks Job Alerts",
      target: "Online Jobs Kenya & Remote Work Africa Groups",
      dailyPosts: "3-8 posts/day (Dedicated Sandbox)",
      seatNumber: 4,
      zone: "yellow",
      zoneLabel: "Facebook Agency Zone",
      // Ground-anchored floor slightly forward
      coords: { leftPercent: 85.0, topPercent: 67.5, widthPercent: 11.0 },
    },
    {
      id: "fb_contentor",
      name: "CONTENTOR",
      role: "Viral Sheng & English Meme Machine",
      emoji: "🔥",
      niche: "Sheng Comedy, Slapstick Video Reels & Viral Banter",
      target: "Nairobi Funniest Memes Group & Profile",
      dailyPosts: "3-8 posts/day (Dedicated Sandbox)",
      seatNumber: 2,
      zone: "yellow",
      zoneLabel: "Facebook Agency Zone",
      // Ground-anchored floor to the right
      coords: { leftPercent: 91.5, topPercent: 70.0, widthPercent: 11.0 },
    },
    {
      id: "ig_real",
      name: "INSTA REAL",
      role: "Drama & Confession Story Cards",
      emoji: "🤫",
      niche: "True Dramatic Confessions & Dilemmas with AI Visuals",
      target: "@instareal_confessions & Instagram Explore",
      dailyPosts: "3-8 posts/day (Dedicated Sandbox)",
      seatNumber: 1,
      zone: "green",
      zoneLabel: "Instagram Media Zone",
      // Ground-anchored bottom-left floor
      coords: { leftPercent: 38.0, topPercent: 74.5, widthPercent: 11.5 },
    },
    {
      id: "ig_shader",
      name: "INSTA SHADER",
      role: "Urban Entertainment & AI Pop News",
      emoji: "✨",
      niche: "The Shade Room Style Celebrity Scoops & AI Scandals",
      target: "@instashader_tea & Instagram Explore",
      dailyPosts: "3-8 posts/day (Dedicated Sandbox)",
      seatNumber: 2,
      zone: "green",
      zoneLabel: "Instagram Media Zone",
      // Ground-anchored bottom-left floor
      coords: { leftPercent: 44.0, topPercent: 76.5, widthPercent: 11.5 },
    },
    {
      id: "analytics",
      name: "Analytics Agent",
      role: "Performance Auditor & Quota Optimizer",
      emoji: "📊",
      niche: "Engagement Velocity, Viral Scoring & Daily Quota Balancing",
      target: "All Active Campaigns & Posts",
      dailyPosts: "Continuous Audit & Risk Throttling",
      seatNumber: 3,
      zone: "blue",
      zoneLabel: "Analytics & Audit Zone",
      // Ground-anchored bottom-right floor near drawer
      coords: { leftPercent: 81.8, topPercent: 92.5, widthPercent: 12.0 },
    },
  ];

  return (
    <div className="relative w-full h-full min-h-[460px] rounded-2xl overflow-hidden bg-slate-900 border border-slate-200/90 shadow-md select-none">
      {/* Office Background Image */}
      <div className="absolute inset-0 w-full h-full">
        <Image
          src={`/offices/${officeTheme}.png`}
          alt="AI Marketing Office"
          fill
          priority
          sizes="(max-width: 1200px) 100vw, 50vw"
          className="object-cover object-center pointer-events-none"
        />
        {/* Subtle ambient lighting vignette */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/30 via-transparent to-transparent pointer-events-none" />
      </div>

      {/* Top Banner with Organization Status */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-30 pointer-events-auto">
        <div className="flex items-center gap-2 bg-slate-900/85 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/20 text-white shadow-lg">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-bold tracking-wide">laxis socials HQ · 7 Seated Agents</span>
        </div>

        <div className="bg-slate-900/85 backdrop-blur-md px-3 py-1 rounded-full border border-white/20 text-white text-[11px] font-semibold flex items-center gap-1.5 shadow-lg">
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span>Independent Cloud Sandboxes ($0 Paused)</span>
        </div>
      </div>

      {/* All 7 Seated Animated Characters on Floor */}
      {AGENT_PLACEMENTS.map((agent) => {
        const isSelected = selectedAgentId === agent.id;
        const isHovered = hoveredAgentId === agent.id;
        const status = agentStatuses[agent.id] || (agent.id === "master" ? "running" : "idle");

        // Compute popover popup alignment to keep within viewport
        const popoverLeft = Math.min(Math.max(agent.coords.leftPercent, 22), 78);
        const popoverTop = Math.max(agent.coords.topPercent - 24, 8);

        return (
          <div
            key={agent.id}
            onMouseEnter={() => setHoveredAgentId(agent.id)}
            onMouseLeave={() => setHoveredAgentId(null)}
          >
            {/* Grounded Typing Animated Character */}
            <AnimatedCharacter
              seatNumber={agent.seatNumber}
              agentId={agent.id}
              agentName={agent.name}
              agentRole={agent.role}
              agentStatus={status}
              avatarEmoji={agent.emoji}
              isSelected={isSelected}
              onClick={() => onSelectAgent?.(agent.id)}
              coords={agent.coords}
              zoneColor={agent.zone}
            />

            {/* Touch/Hover Popover Card with Full Agent Blueprint Details */}
            {isHovered && (
              <div
                style={{
                  left: `${popoverLeft}%`,
                  top: `${popoverTop}%`,
                }}
                className="absolute -translate-x-1/2 z-50 w-72 bg-slate-900/95 backdrop-blur-md rounded-2xl border border-white/20 p-3.5 shadow-2xl text-white pointer-events-auto animate-in fade-in zoom-in-95 duration-150"
              >
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base">{agent.emoji}</span>
                    <span className="font-bold text-xs text-white truncate">{agent.name}</span>
                  </div>
                  <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> Sandbox Ready
                  </span>
                </div>

                <div className="space-y-1.5 text-[11px]">
                  <div>
                    <span className="text-slate-400 font-medium text-[10px] uppercase tracking-wider block">
                      Role &amp; Zone
                    </span>
                    <span className="text-slate-200 font-medium">{agent.role}</span>
                  </div>

                  <div>
                    <span className="text-slate-400 font-medium text-[10px] uppercase tracking-wider block">
                      Niche
                    </span>
                    <span className="text-blue-300 font-medium">{agent.niche}</span>
                  </div>

                  <div>
                    <span className="text-slate-400 font-medium text-[10px] uppercase tracking-wider block">
                      Posting Strategy
                    </span>
                    <span className="text-amber-300 font-medium">{agent.dailyPosts}</span>
                  </div>
                </div>

                <button
                  onClick={() => onSelectAgent?.(agent.id)}
                  className="mt-3 w-full py-1.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-md shadow-blue-500/25"
                >
                  <span>Open Active Workspace &amp; Desktop</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* Bottom Color Zone Legend & Hint */}
      <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between z-20 pointer-events-none">
        <div className="flex items-center gap-2 bg-slate-900/85 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-semibold text-white/90 border border-white/15 shadow-md">
          <span className="flex items-center gap-1 text-red-400">
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Master
          </span>
          <span className="text-white/30">|</span>
          <span className="flex items-center gap-1 text-amber-300">
            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> 3x Facebook
          </span>
          <span className="text-white/30">|</span>
          <span className="flex items-center gap-1 text-emerald-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> 2x Instagram
          </span>
          <span className="text-white/30">|</span>
          <span className="flex items-center gap-1 text-blue-300">
            <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> Analytics
          </span>
        </div>

        <div className="hidden sm:flex items-center gap-1 bg-slate-900/85 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-medium text-slate-300 border border-white/15 shadow-md">
          <Info className="w-3 h-3 text-blue-400" />
          <span>Click any agent avatar to inspect &amp; control</span>
        </div>
      </div>
    </div>
  );
}
