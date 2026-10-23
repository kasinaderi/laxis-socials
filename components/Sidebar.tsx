"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Bot,
  FileText,
  CalendarDays,
  BarChart3,
  Users2,
  Settings,
  ChevronDown,
  Sparkles,
  PanelLeftClose,
  Radio,
} from "lucide-react";
import { useState } from "react";

export function Sidebar({ campaignName = "laxis socials", campaignIcon = "☕" }: { campaignName?: string; campaignIcon?: string }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const navItems = [
    { label: "Overview", href: "/", icon: LayoutDashboard, color: "text-blue-500" },
    { label: "AI Agent", href: "/dashboard/ai-agent", icon: Bot, color: "text-purple-500" },
    { label: "Posts", href: "/dashboard/posts", icon: FileText, color: "text-pink-500" },
    { label: "Calendar", href: "/dashboard/calendar", icon: CalendarDays, color: "text-amber-500" },
    { label: "Analytics", href: "/dashboard/analytics", icon: BarChart3, color: "text-emerald-500" },
    { label: "Accounts", href: "/dashboard/accounts", icon: Users2, color: "text-cyan-500" },
  ];

  return (
    <aside
      className={`h-screen bg-white border-r border-slate-100 flex flex-col transition-all duration-300 z-30 select-none ${
        collapsed ? "w-20" : "w-64"
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 flex items-center px-5 gap-3 border-b border-slate-100">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
          <Sparkles className="w-5 h-5" />
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="font-bold text-lg text-slate-800 tracking-tight flex items-center gap-1.5">
              Socialix
              <span className="text-[10px] font-semibold bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full border border-blue-100 uppercase tracking-wider">
                Free
              </span>
            </span>
          </div>
        )}
      </div>

      {/* Campaign Switcher Pill */}
      <div className="p-3">
        <div className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100/70 transition-colors cursor-pointer">
          <div className="w-8 h-8 rounded-lg bg-pink-500/10 text-pink-600 flex items-center justify-center text-base font-medium flex-shrink-0">
            {campaignIcon}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Campaign</div>
              <div className="text-sm font-semibold text-slate-700 truncate">{campaignName}</div>
            </div>
          )}
          {!collapsed && <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </div>

      {/* Navigation Menu */}
      <div className="flex-1 px-3 py-2 space-y-1">
        <div className="text-[11px] font-semibold text-slate-400 px-3 py-1 uppercase tracking-wider">
          {!collapsed ? "Menu" : "•"}
        </div>
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-all group ${
                isActive
                  ? "bg-blue-50 text-blue-600 font-semibold shadow-sm"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                  isActive ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500 group-hover:bg-slate-200"
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>
              {!collapsed && <span>{item.label}</span>}
              {!collapsed && item.label === "Accounts" && (
                <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md font-semibold">
                  <Radio className="w-3 h-3 animate-pulse" />
                  Live
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* Footer Navigation */}
      <div className="p-3 border-t border-slate-100 space-y-1">
        <Link
          href="/dashboard/settings"
          className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors"
        >
          <Settings className="w-4 h-4 text-slate-500" />
          {!collapsed && <span>Settings</span>}
        </Link>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors"
        >
          <PanelLeftClose className={`w-4 h-4 transition-transform ${collapsed ? "rotate-180" : ""}`} />
          {!collapsed && <span>Collapse</span>}
          {!collapsed && <span className="ml-auto text-xs text-slate-400">⌘B</span>}
        </button>
      </div>
    </aside>
  );
}
