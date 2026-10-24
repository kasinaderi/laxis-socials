"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { AnimatedCharacter } from "./AnimatedCharacter";
import {
  ShieldCheck,
  Zap,
  ChevronRight,
  Move,
  Save,
  RotateCcw,
  Check,
  X,
  Sliders,
  Info,
} from "lucide-react";

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
  defaultCoords: { leftPercent: number; topPercent: number; widthPercent: number };
}

export interface OfficePreviewProps {
  selectedAgentId?: string;
  onSelectAgent?: (agentId: string) => void;
  officeTheme?: "wooden-office" | "modern-office";
  agentStatuses?: Record<string, "idle" | "running" | "done" | "paused">;
  campaignId?: string;
}

export const DEFAULT_AGENT_CONFIGS: AgentOfficePlacement[] = [
  {
    id: "master",
    name: "Master Agent",
    role: "Campaign Orchestrator & Director",
    emoji: "👑",
    niche: "Autonomous Daily Schedule & Cross-Agent Coordination",
    target: "All 6 Agents & Workstations",
    dailyPosts: "Decides 3-8 posts/day per agent (Randomized Human Times)",
    seatNumber: 1,
    zone: "red",
    zoneLabel: "Master Control Zone",
    defaultCoords: { leftPercent: 50.0, topPercent: 48.0, widthPercent: 10.5 },
  },
  {
    id: "fb_laxdollar",
    name: "LAXDOLLAR FB",
    role: "Deriv Trading & laxdollar.site Marketer",
    emoji: "📈",
    niche: "Deriv Boom & Crash, Synthetic Indices & Money Memes",
    target: "laxdollar.site & 3x FB Trading Groups",
    dailyPosts: "3-8 posts/day (Dedicated Agent PC)",
    seatNumber: 3,
    zone: "yellow",
    zoneLabel: "Facebook Agency Zone",
    defaultCoords: { leftPercent: 24.0, topPercent: 62.0, widthPercent: 11.0 },
  },
  {
    id: "fb_jotrainer",
    name: "JOTRAINER JOBS",
    role: "Microwork & AI Training Jobs Scout",
    emoji: "💼",
    niche: "Remote AI Annotation, Outlier & Remotasks Job Alerts",
    target: "Online Jobs Kenya & Remote Work Africa Groups",
    dailyPosts: "3-8 posts/day (Dedicated Agent PC)",
    seatNumber: 4,
    zone: "yellow",
    zoneLabel: "Facebook Agency Zone",
    defaultCoords: { leftPercent: 32.0, topPercent: 38.0, widthPercent: 10.5 },
  },
  {
    id: "fb_contentor",
    name: "CONTENTOR",
    role: "Viral Sheng & English Meme Machine",
    emoji: "🔥",
    niche: "Sheng Comedy, Slapstick Video Reels & Viral Banter",
    target: "Nairobi Funniest Memes Group & Profile",
    dailyPosts: "3-8 posts/day (Dedicated Agent PC)",
    seatNumber: 2,
    zone: "yellow",
    zoneLabel: "Facebook Agency Zone",
    defaultCoords: { leftPercent: 68.0, topPercent: 50.0, widthPercent: 11.0 },
  },
  {
    id: "ig_real",
    name: "INSTA REAL",
    role: "Drama & Confession Story Cards",
    emoji: "🤫",
    niche: "True Dramatic Confessions & Dilemmas with AI Visuals",
    target: "@instareal_confessions & Instagram Explore",
    dailyPosts: "3-8 posts/day (Dedicated Agent PC)",
    seatNumber: 1,
    zone: "green",
    zoneLabel: "Instagram Media Zone",
    defaultCoords: { leftPercent: 18.0, topPercent: 78.0, widthPercent: 11.5 },
  },
  {
    id: "ig_shader",
    name: "INSTA SHADER",
    role: "Urban Entertainment & AI Pop News",
    emoji: "✨",
    niche: "The Shade Room Style Celebrity Scoops & AI Scandals",
    target: "@instashader_tea & Instagram Explore",
    dailyPosts: "3-8 posts/day (Dedicated Agent PC)",
    seatNumber: 2,
    zone: "green",
    zoneLabel: "Instagram Media Zone",
    defaultCoords: { leftPercent: 32.0, topPercent: 82.0, widthPercent: 11.5 },
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
    // Well positioned anchor matching user approval
    defaultCoords: { leftPercent: 81.8, topPercent: 92.5, widthPercent: 12.0 },
  },
];

export function OfficePreview({
  selectedAgentId = "fb_laxdollar",
  onSelectAgent,
  officeTheme = "wooden-office",
  agentStatuses = {},
  campaignId = "default_campaign",
}: OfficePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Layout positions state
  const [positions, setPositions] = useState<
    Record<string, { leftPercent: number; topPercent: number; widthPercent: number }>
  >(() => {
    const initial: Record<string, { leftPercent: number; topPercent: number; widthPercent: number }> = {};
    for (const ag of DEFAULT_AGENT_CONFIGS) {
      initial[ag.id] = { ...ag.defaultCoords };
    }
    return initial;
  });

  const [isEditMode, setIsEditMode] = useState(false);
  const [draggingAgentId, setDraggingAgentId] = useState<string | null>(null);
  const [hoveredAgentId, setHoveredAgentId] = useState<string | null>(null);
  const [showInfoCards, setShowInfoCards] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [avatarScale, setAvatarScale] = useState<number>(1.0);

  // Load saved layout on mount (from localStorage first, then sync with Turso cloud)
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.search.includes("arrange=true")) {
      setIsEditMode(true);
    }

    // 1. LocalStorage for immediate instant rendering
    try {
      const cached = localStorage.getItem(`office_layout_${campaignId}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        setPositions((prev) => ({ ...prev, ...parsed }));
      }
      const savedScale = localStorage.getItem(`office_scale_${campaignId}`);
      if (savedScale) {
        const num = parseFloat(savedScale);
        if (!isNaN(num) && num >= 0.7 && num <= 1.6) setAvatarScale(num);
      }
    } catch (e) {}

    // 2. Fetch from Turso Cloud
    fetch(`/api/campaign/layout?campaignId=${campaignId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.layout) {
          setPositions((prev) => ({ ...prev, ...data.layout }));
          if (data.scale) setAvatarScale(data.scale);
          try {
            localStorage.setItem(`office_layout_${campaignId}`, JSON.stringify(data.layout));
            if (data.scale) localStorage.setItem(`office_scale_${campaignId}`, data.scale.toString());
          } catch (e) {}
        }
      })
      .catch((err) => console.warn("Layout fetch notice:", err));
  }, [campaignId]);

  // Pointer drag handling (works seamlessly on Mouse + Mobile/Tablet Touch)
  const handlePointerDown = (agentId: string, e: React.PointerEvent) => {
    if (!isEditMode) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch (err) {}
    setDraggingAgentId(agentId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isEditMode || !draggingAgentId || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = e.clientX;
    const clientY = e.clientY;

    const leftPercent = Math.min(Math.max(((clientX - rect.left) / rect.width) * 100, 6), 94);
    const topPercent = Math.min(Math.max(((clientY - rect.top) / rect.height) * 100, 22), 95);

    setPositions((prev) => ({
      ...prev,
      [draggingAgentId]: {
        ...prev[draggingAgentId],
        leftPercent: parseFloat(leftPercent.toFixed(1)),
        topPercent: parseFloat(topPercent.toFixed(1)),
      },
    }));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (draggingAgentId) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch (err) {}
      setDraggingAgentId(null);
    }
  };

  // Save layout to localStorage and Turso Cloud
  const handleSaveLayout = async () => {
    setIsSaving(true);
    try {
      localStorage.setItem(`office_layout_${campaignId}`, JSON.stringify(positions));
      localStorage.setItem(`office_scale_${campaignId}`, avatarScale.toString());
      await fetch("/api/campaign/layout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, layout: positions, scale: avatarScale }),
      });
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setIsEditMode(false);
      }, 1200);
    } catch (err) {
      console.error("Save layout error:", err);
    } finally {
      setIsSaving(false);
    }
  };

  // Reset to default layout
  const handleResetLayout = async () => {
    const initial: Record<string, { leftPercent: number; topPercent: number; widthPercent: number }> = {};
    for (const ag of DEFAULT_AGENT_CONFIGS) {
      initial[ag.id] = { ...ag.defaultCoords };
    }
    setPositions(initial);
    try {
      localStorage.removeItem(`office_layout_${campaignId}`);
      await fetch(`/api/campaign/layout?campaignId=${campaignId}`, { method: "DELETE" });
    } catch (e) {}
  };

  // Active agent to inspect (for info card)
  const activeInspectorAgent = hoveredAgentId || (isEditMode ? draggingAgentId : null);
  const activeAgentConfig = DEFAULT_AGENT_CONFIGS.find((a) => a.id === activeInspectorAgent);
  const activeAgentCoords = activeInspectorAgent ? positions[activeInspectorAgent] : null;

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className="relative isolate w-full h-full min-h-[460px] rounded-2xl overflow-hidden bg-slate-900 border border-slate-200/90 shadow-md select-none"
    >
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
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/40 via-transparent to-transparent pointer-events-none" />
      </div>

      {/* Top Banner Toolbar */}
      <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between z-30 pointer-events-auto gap-2">
        <div className={`items-center gap-2 bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/20 text-white shadow-lg ${isEditMode ? "hidden md:flex" : "flex"}`}>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-bold tracking-wide">laxis socials HQ · Virtual Office</span>
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center gap-1.5 flex-wrap ml-auto">
          {isEditMode ? (
            <div className="flex flex-wrap items-center gap-1.5 bg-slate-900/95 backdrop-blur-md p-1 rounded-2xl sm:rounded-full border border-blue-500/50 shadow-xl animate-in zoom-in-95 duration-150">
              <span className="text-[11px] font-bold text-blue-300 px-2 flex items-center gap-1">
                <Move className="w-3.5 h-3.5 animate-pulse text-blue-400" /> Drag seats
              </span>

              {/* Avatar Size Slider */}
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-800 rounded-full border border-white/15 text-[10px] text-slate-300">
                <span className="font-semibold text-slate-400">Size:</span>
                <input
                  type="range"
                  min="0.7"
                  max="1.5"
                  step="0.05"
                  value={avatarScale}
                  onChange={(e) => setAvatarScale(parseFloat(e.target.value))}
                  className="w-14 sm:w-16 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-400"
                  title={`Avatar size: ${Math.round(avatarScale * 100)}%`}
                />
                <span className="font-mono text-[9px] text-blue-300">{Math.round(avatarScale * 100)}%</span>
              </div>

              <button
                onClick={handleSaveLayout}
                disabled={isSaving}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded-full flex items-center gap-1 shadow-md transition-all cursor-pointer flex-shrink-0"
              >
                {saveSuccess ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-white" /> Saved!
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" /> Save Layout
                  </>
                )}
              </button>

              <button
                onClick={handleResetLayout}
                title="Reset to default seats"
                className="p-1 hover:bg-white/10 rounded-full text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => setIsEditMode(false)}
                title="Exit layout mode"
                className="p-1 hover:bg-white/10 rounded-full text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md px-2 py-1 rounded-full border border-white/20 text-white shadow-lg">
              <button
                onClick={() => setIsEditMode(true)}
                className="px-2.5 py-0.5 bg-blue-600/80 hover:bg-blue-600 text-white text-[11px] font-semibold rounded-full flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
              >
                <Sliders className="w-3.5 h-3.5 text-blue-200" />
                <span>Rearrange Seats</span>
              </button>

              <button
                onClick={() => setShowInfoCards(!showInfoCards)}
                title={showInfoCards ? "Hide Info Cards" : "Show Info Cards"}
                className={`p-1 rounded-full text-[10px] font-semibold transition-colors cursor-pointer ${
                  showInfoCards ? "text-blue-300 bg-white/10" : "text-slate-400 hover:text-white"
                }`}
              >
                <Info className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* All 7 Seated Animated Characters */}
      {DEFAULT_AGENT_CONFIGS.map((agent) => {
        const isSelected = selectedAgentId === agent.id;
        const status = agentStatuses[agent.id] || (agent.id === "master" ? "running" : "idle");
        const currentCoords = positions[agent.id] || agent.defaultCoords;
        const isDragging = draggingAgentId === agent.id;

        return (
          <div
            key={agent.id}
            onMouseEnter={() => !isEditMode && setHoveredAgentId(agent.id)}
            onMouseLeave={() => !isEditMode && setHoveredAgentId(null)}
          >
            <AnimatedCharacter
              seatNumber={agent.seatNumber}
              agentId={agent.id}
              agentName={agent.name}
              agentRole={agent.role}
              agentStatus={status}
              avatarEmoji={agent.emoji}
              isSelected={isSelected}
              onClick={() => onSelectAgent?.(agent.id)}
              coords={currentCoords}
              zoneColor={agent.zone}
              isDraggable={isEditMode}
              isDragging={isDragging}
              onPointerDown={(e) => handlePointerDown(agent.id, e)}
              scale={avatarScale}
            />
          </div>
        );
      })}

      {/* Dynamic Information Card (Only opens if toggled, never leaks outside office) */}
      {showInfoCards && activeAgentConfig && activeAgentCoords && (
        <div
          style={{
            left: `${Math.min(Math.max(activeAgentCoords.leftPercent, 22), 78)}%`,
            top: `${
              activeAgentCoords.topPercent < 36
                ? activeAgentCoords.topPercent + 6
                : Math.max(activeAgentCoords.topPercent - 28, 8)
            }%`,
          }}
          className="absolute -translate-x-1/2 z-40 w-72 bg-slate-900/95 backdrop-blur-md rounded-2xl border border-white/20 p-3.5 shadow-2xl text-white pointer-events-auto transition-all duration-75 animate-in fade-in zoom-in-95"
        >
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
            <div className="flex items-center gap-1.5">
              <span className="text-base">{activeAgentConfig.emoji}</span>
              <span className="font-bold text-xs text-white truncate">{activeAgentConfig.name}</span>
            </div>
            <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> Dedicated Agent PC
            </span>
          </div>

          <div className="space-y-1.5 text-[11px]">
            <div>
              <span className="text-slate-400 font-medium text-[10px] uppercase tracking-wider block">
                Role
              </span>
              <span className="text-slate-200 font-medium">{activeAgentConfig.role}</span>
            </div>

            <div>
              <span className="text-slate-400 font-medium text-[10px] uppercase tracking-wider block">
                Niche
              </span>
              <span className="text-blue-300 font-medium">{activeAgentConfig.niche}</span>
            </div>

            <div>
              <span className="text-slate-400 font-medium text-[10px] uppercase tracking-wider block">
                Posting Strategy
              </span>
              <span className="text-amber-300 font-medium">{activeAgentConfig.dailyPosts}</span>
            </div>
          </div>

          {!isEditMode && (
            <button
              onClick={() => onSelectAgent?.(activeAgentConfig.id)}
              className="mt-3 w-full py-1.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-md shadow-blue-500/25"
            >
              <span>Open Active Workspace &amp; PC</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
