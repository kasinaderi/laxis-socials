"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { OfficePreview } from "@/components/OfficePreview";
import { CreatePostModal } from "@/components/CreatePostModal";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Sparkles,
  Bot,
  ArrowRight,
  TrendingUp,
  Share2,
} from "lucide-react";
import Link from "next/link";

export default function OverviewPage() {
  const [agents, setAgents] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [campaign, setCampaign] = useState<any>(null);
  const [selectedAgentId, setSelectedAgentId] = useState("fb_laxdollar");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const fetchDashboardData = async () => {
    try {
      const [agentRes, postRes] = await Promise.all([
        fetch("/api/agents"),
        fetch("/api/posts"),
      ]);
      const agentData = await agentRes.json();
      const postData = await postRes.json();

      if (agentData.agents) setAgents(agentData.agents);
      if (agentData.tasks) setTasks(agentData.tasks);
      if (agentData.campaign) setCampaign(agentData.campaign);
      if (postData.posts) setPosts(postData.posts);
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 15000);
    return () => clearInterval(interval);
  }, []);

  const scheduledPosts = posts.filter((p) => p.status === "scheduled");
  const publishedPosts = posts.filter((p) => p.status === "published");

  return (
    <div className="flex h-screen bg-slate-100/60 dark:bg-slate-950 overflow-hidden font-sans transition-colors">
      <Sidebar campaignName={campaign?.name} campaignIcon={campaign?.icon} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header
          title="Campaign Overview"
          subtitle="Real-time multi-agent marketing operations & virtual office"
          onCreatePostClick={() => setIsCreateModalOpen(true)}
        />

        <main className="flex-1 p-3.5 sm:p-6 overflow-y-auto pb-24 lg:pb-6">
          {/* Top Quick Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5 sm:mb-6">
            <div className="bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs flex items-center gap-3">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-lg flex-shrink-0">
                <Bot className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div className="min-w-0">
                <div className="text-base sm:text-xl font-bold text-slate-800 dark:text-white leading-tight truncate">
                  {agents.length > 0 ? `${agents.length} AI Agents` : "7 AI Agents"}
                </div>
                <div className="text-[11px] sm:text-xs text-slate-400 dark:text-slate-400 font-medium truncate">
                  Virtual Marketing Team
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs flex items-center gap-3">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-lg flex-shrink-0">
                <CalendarDays className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div className="min-w-0">
                <div className="text-base sm:text-xl font-bold text-slate-800 dark:text-white leading-tight truncate">
                  {scheduledPosts.length} Scheduled
                </div>
                <div className="text-[11px] sm:text-xs text-slate-400 dark:text-slate-400 font-medium truncate">
                  Due this week
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs flex items-center gap-3">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-lg flex-shrink-0">
                <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div className="min-w-0">
                <div className="text-base sm:text-xl font-bold text-slate-800 dark:text-white leading-tight truncate">
                  {publishedPosts.length} Published
                </div>
                <div className="text-[11px] sm:text-xs text-slate-400 dark:text-slate-400 font-medium truncate">
                  Via Locoagent CDP
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs flex items-center gap-3">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold text-lg flex-shrink-0">
                <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div className="min-w-0">
                <div className="text-base sm:text-xl font-bold text-slate-800 dark:text-white leading-tight truncate">
                  100% Free
                </div>
                <div className="text-[11px] sm:text-xs text-slate-400 dark:text-slate-400 font-medium truncate">
                  Zero billing limits
                </div>
              </div>
            </div>
          </div>

          {/* Main 2-Column Split: Operations / Virtual Office */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 min-h-[500px]">
            {/* Left Column (5 cols): Activity & Next Actions */}
            <div className="lg:col-span-5 flex flex-col gap-4 sm:gap-5">
              {/* Master Agent Quick Prompt Card */}
              <div className="bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 p-4 sm:p-5 rounded-2xl text-white shadow-lg shadow-blue-500/15 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="bg-white/20 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider">
                      Master Orchestrator
                    </span>
                  </div>
                  <h3 className="font-bold text-base leading-snug mb-1">One Instruction. Your Team Handles the Rest.</h3>
                  <p className="text-xs text-blue-100 leading-relaxed">
                    Give the Master Agent a goal. It breaks it down, runs Google &amp; trend research, writes viral copy, generates Flux visuals, and publishes into groups autonomously.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-white/20 flex items-center justify-between">
                  <span className="text-xs font-semibold text-blue-100">Ready for commands</span>
                  <Link
                    href="/dashboard/ai-agent"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white text-blue-700 hover:bg-blue-50 text-xs font-bold shadow-xs transition-colors"
                  >
                    <span>Open Agent Hub</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>

              {/* Upcoming Scheduled Posts Preview */}
              <div className="flex-1 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 shadow-2xs flex flex-col overflow-hidden">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
                  <h4 className="font-bold text-xs text-slate-800 dark:text-white uppercase tracking-wider">Upcoming Scheduled Content</h4>
                  <Link href="/dashboard/calendar" className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-semibold">
                    View Calendar
                  </Link>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2.5 max-h-72 lg:max-h-none">
                  {scheduledPosts.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400">
                      <Clock className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                      No scheduled posts yet. Create a post or prompt the Master Agent to schedule your weekly campaign.
                    </div>
                  ) : (
                    scheduledPosts.slice(0, 4).map((post) => (
                      <div
                        key={post.id}
                        className="p-3 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100/70 dark:hover:bg-slate-800 rounded-xl border border-slate-200/60 dark:border-slate-700/60 transition-colors flex items-center gap-3"
                      >
                        <div className="w-10 h-10 rounded-lg bg-slate-200 dark:bg-slate-700 overflow-hidden flex-shrink-0 relative">
                          {JSON.parse(post.mediaUrls || "[]")[0] ? (
                            <img
                              src={JSON.parse(post.mediaUrls)[0]}
                              alt="Thumbnail"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">☕</div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h5 className="font-semibold text-xs text-slate-800 dark:text-white truncate">{post.title}</h5>
                          <p className="text-[11px] text-slate-400 dark:text-slate-400 truncate">{post.caption}</p>
                        </div>
                        <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/80 px-2 py-0.5 rounded-full whitespace-nowrap">
                          {post.scheduledAt
                            ? new Date(post.scheduledAt).toLocaleDateString([], { month: "short", day: "numeric" })
                            : "Queued"}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Right Column (7 cols): The Reusable Isometric Virtual AI Office */}
            <div className="lg:col-span-7 flex flex-col bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 shadow-2xs">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <h3 className="font-bold text-sm text-slate-800 dark:text-white">Virtual AI Marketing Office</h3>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-medium">
                  <span>Theme: {campaign?.officeStyle || "wooden-office"}</span>
                </div>
              </div>

              <div className="flex-1 min-h-[360px] sm:min-h-[420px] rounded-xl overflow-hidden relative">
                <OfficePreview
                  officeTheme={campaign?.officeStyle || "wooden-office"}
                  selectedAgentId={selectedAgentId}
                  onSelectAgent={(id) => setSelectedAgentId(id)}
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
        onPostCreated={fetchDashboardData}
        campaignId={campaign?.id}
      />
    </div>
  );
}
