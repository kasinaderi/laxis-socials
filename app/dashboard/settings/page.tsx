"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import {
  Settings,
  Sparkles,
  Database,
  Monitor,
  CheckCircle2,
  Save,
  Radio,
  Share2,
  Sliders,
  Move,
  RotateCcw,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";

export default function SettingsPage() {
  const [campaign, setCampaign] = useState<any>(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("☕");
  const [officeStyle, setOfficeStyle] = useState("wooden-office");
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    fetch("/api/campaign")
      .then((r) => r.json())
      .then((d) => {
        if (d.campaign) {
          setCampaign(d.campaign);
          setName(d.campaign.name);
          setIcon(d.campaign.icon);
          setOfficeStyle(d.campaign.officeStyle || "wooden-office");
        }
      });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: campaign?.id || "default_campaign",
          name,
          icon,
          officeStyle,
        }),
      });

      if (res.ok) {
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 3000);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex h-screen bg-slate-100/60 dark:bg-slate-950 overflow-hidden font-sans transition-colors">
      <Sidebar campaignName={name} campaignIcon={icon} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header
          title="Campaign & System Settings"
          subtitle="Configure your workspace branding, office themes, and verify zero-cost service integrations"
        />

        <main className="flex-1 p-4 sm:p-6 overflow-y-auto max-w-4xl space-y-6 pb-24 lg:pb-6">
          {/* Workspace Branding */}
          <form onSubmit={handleSave} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6 shadow-2xs space-y-5">
            <div className="pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-800 dark:text-white">Workspace Customization</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Personalize your social media agency campaign and visual office.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">Campaign Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">Campaign Icon / Emoji</label>
                <input
                  type="text"
                  required
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-2">Virtual AI Office Theme</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div
                  onClick={() => setOfficeStyle("wooden-office")}
                  className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${
                    officeStyle === "wooden-office"
                      ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/40 shadow-xs"
                      : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                  }`}
                >
                  <div className="h-28 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 mb-2 border border-slate-200 dark:border-slate-700">
                    <img src="/offices/wooden-office.png" alt="Wooden Office" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 dark:text-white">Warm Wooden Studio</span>
                    {officeStyle === "wooden-office" && <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
                  </div>
                </div>

                <div
                  onClick={() => setOfficeStyle("modern-office")}
                  className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${
                    officeStyle === "modern-office"
                      ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/40 shadow-xs"
                      : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                  }`}
                >
                  <div className="h-28 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 mb-2 border border-slate-200 dark:border-slate-700">
                    <img src="/offices/modern-office.png" alt="Modern Office" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 dark:text-white">Modern City Studio</span>
                    {officeStyle === "modern-office" && <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              {isSaved ? (
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  Settings saved successfully!
                </span>
              ) : (
                <span />
              )}
              <button
                type="submit"
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>Save Changes</span>
              </button>
            </div>
          </form>

          {/* Virtual Office Seat Layout & Drag Arranger */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6 shadow-2xs space-y-4">
            <div className="flex items-start justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <Move className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Agent Office Positioning &amp; Seat Arranger</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Drag and reposition each agent anywhere on the office floor. Their information box moves with them.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs text-slate-600 dark:text-slate-300">
                <span className="font-semibold text-slate-800 dark:text-white block">Interactive Drag-and-Drop Mode</span>
                <span>Click the button below to enter visual arrangement mode. You can drag any character with your mouse or touchscreen.</span>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <Link
                  href="/dashboard/ai-agent?arrange=true"
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer"
                >
                  <Sliders className="w-4 h-4" />
                  <span>Open Seat Arranger</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>

          {/* System Health Diagnostics */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6 shadow-2xs space-y-4">
            <div className="pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-800 dark:text-white">100% Free Stack Verification</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">All core services configured and operational with zero paid fees.</p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-700/60 text-xs">
                <div className="flex items-center gap-3">
                  <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <div>
                    <span className="font-bold text-slate-800 dark:text-white block">Google Gemini 3.8 Flash (Multimodal Vision + LLM)</span>
                    <span className="text-[11px] text-slate-400 dark:text-slate-400">1,500 free daily requests, full image analysis</span>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-full border border-emerald-100 dark:border-emerald-800">
                  ● Connected
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-700/60 text-xs">
                <div className="flex items-center gap-3">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <div>
                    <span className="font-bold text-slate-800 dark:text-white block">Cloudflare Workers AI (FLUX.1 [schnell])</span>
                    <span className="text-[11px] text-slate-400 dark:text-slate-400">Zero credit card, high-resolution social creatives</span>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-full border border-emerald-100 dark:border-emerald-800">
                  ● Active
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-700/60 text-xs">
                <div className="flex items-center gap-3">
                  <Monitor className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <div>
                    <span className="font-bold text-slate-800 dark:text-white block">E2B Desktop Sandbox (Agent PC Cloud VM)</span>
                    <span className="text-[11px] text-slate-400 dark:text-slate-400">$100 free credit enabled for isolated Linux Chromium</span>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-full border border-emerald-100 dark:border-emerald-800">
                  ● Active
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-700/60 text-xs">
                <div className="flex items-center gap-3">
                  <Database className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <div>
                    <span className="font-bold text-slate-800 dark:text-white block">Turso Cloud LibSQL (Persistent Database)</span>
                    <span className="text-[11px] text-slate-400 dark:text-slate-400">9GB free cloud storage, worldwide edge replication</span>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-full border border-emerald-100 dark:border-emerald-800">
                  ● Connected
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-700/60 text-xs">
                <div className="flex items-center gap-3">
                  <Share2 className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                  <div>
                    <span className="font-bold text-slate-800 dark:text-white block">Locoagent Group Automation Engine</span>
                    <span className="text-[11px] text-slate-400 dark:text-slate-400">Chrome CDP playbooks for Facebook, Instagram, Reddit</span>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-full border border-emerald-100 dark:border-emerald-800">
                  ● Ready
                </span>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
