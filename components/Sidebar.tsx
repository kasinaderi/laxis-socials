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
  Sun,
  Moon,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";
import { useTheme } from "./ThemeProvider";

interface SidebarProps {
  campaignName?: string;
  campaignIcon?: string;
}

export function Sidebar({
  campaignName = "laxis socials",
  campaignIcon = "☕",
}: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const navItems = [
    { label: "Overview", href: "/", icon: LayoutDashboard, color: "text-blue-500" },
    { label: "AI Agent", href: "/dashboard/ai-agent", icon: Bot, color: "text-purple-500" },
    { label: "Posts", href: "/dashboard/posts", icon: FileText, color: "text-pink-500" },
    { label: "Calendar", href: "/dashboard/calendar", icon: CalendarDays, color: "text-amber-500" },
    { label: "Deriv Lab", href: "/dashboard/analytics", icon: BarChart3, color: "text-emerald-500" },
    { label: "Accounts", href: "/dashboard/accounts", icon: Users2, color: "text-cyan-500" },
  ];

  return (
    <>
      {/* ============================================================ */}
      {/* 1. Desktop Sidebar (Hidden on Mobile screens, visible on lg+) */}
      {/* ============================================================ */}
      <aside
        className={`hidden lg:flex h-screen bg-white dark:bg-slate-900 border-r border-slate-200/80 dark:border-slate-800 flex-col transition-all duration-300 z-30 select-none flex-shrink-0 ${
          collapsed ? "w-20" : "w-64"
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center px-5 gap-3 border-b border-slate-200/80 dark:border-slate-800">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20 flex-shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="font-bold text-lg text-slate-800 dark:text-white tracking-tight flex items-center gap-1.5">
                Socialix
                <span className="text-[10px] font-semibold bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-full border border-blue-100 dark:border-blue-800 uppercase tracking-wider">
                  Free
                </span>
              </span>
            </div>
          )}
        </div>

        {/* Campaign Switcher Pill */}
        <div className="p-3">
          <div className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 hover:bg-slate-100/70 dark:hover:bg-slate-800 transition-colors cursor-pointer">
            <div className="w-8 h-8 rounded-lg bg-pink-500/10 text-pink-600 dark:text-pink-400 flex items-center justify-center text-base font-medium flex-shrink-0">
              {campaignIcon}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Campaign
                </div>
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">
                  {campaignName}
                </div>
              </div>
            )}
            {!collapsed && <ChevronDown className="w-4 h-4 text-slate-400" />}
          </div>
        </div>

        {/* Navigation Menu */}
        <div className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          <div className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 px-3 py-1 uppercase tracking-wider">
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
                    ? "bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-semibold shadow-2xs border border-blue-100/60 dark:border-blue-900/40"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/60"
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                    isActive
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:bg-slate-200 dark:group-hover:bg-slate-700"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                {!collapsed && <span>{item.label}</span>}
                {!collapsed && item.label === "Accounts" && (
                  <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/80 px-1.5 py-0.5 rounded-md font-semibold border border-emerald-200/60 dark:border-emerald-800">
                    <Radio className="w-3 h-3 animate-pulse" />
                    Live
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Footer Navigation */}
        <div className="p-3 border-t border-slate-200/80 dark:border-slate-800 space-y-1">
          {/* Dark Mode Switcher */}
          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            {theme === "dark" ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-slate-500" />
            )}
            {!collapsed && <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>}
          </button>

          <Link
            href="/dashboard/settings"
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <Settings className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            {!collapsed && <span>Settings</span>}
          </Link>

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <PanelLeftClose
              className={`w-4 h-4 transition-transform ${collapsed ? "rotate-180" : ""}`}
            />
            {!collapsed && <span>Collapse</span>}
            {!collapsed && <span className="ml-auto text-xs text-slate-400">⌘B</span>}
          </button>
        </div>
      </aside>

      {/* ============================================================ */}
      {/* 2. Mobile Bottom Navigation Bar (Screens < lg)                */}
      {/* ============================================================ */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-around py-2 px-2 shadow-lg safe-bottom">
        <Link
          href="/"
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl text-[10px] font-semibold transition-all ${
            pathname === "/"
              ? "text-blue-600 dark:text-blue-400"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <LayoutDashboard className="w-5 h-5" />
          <span>Overview</span>
        </Link>

        <Link
          href="/dashboard/ai-agent"
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl text-[10px] font-semibold transition-all ${
            pathname === "/dashboard/ai-agent"
              ? "text-blue-600 dark:text-blue-400"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <div className="relative">
            <Bot className="w-5 h-5" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          </div>
          <span>AI Agents</span>
        </Link>

        <Link
          href="/dashboard/posts"
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl text-[10px] font-semibold transition-all ${
            pathname === "/dashboard/posts"
              ? "text-blue-600 dark:text-blue-400"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <FileText className="w-5 h-5" />
          <span>Posts</span>
        </Link>

        <Link
          href="/dashboard/calendar"
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl text-[10px] font-semibold transition-all ${
            pathname === "/dashboard/calendar"
              ? "text-blue-600 dark:text-blue-400"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <CalendarDays className="w-5 h-5" />
          <span>Calendar</span>
        </Link>

        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className="flex flex-col items-center gap-1 py-1 px-3 rounded-xl text-[10px] font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
        >
          <Menu className="w-5 h-5" />
          <span>Menu</span>
        </button>
      </nav>

      {/* ============================================================ */}
      {/* 3. Mobile Slide-Over Drawer (Toggled by "Menu" button)       */}
      {/* ============================================================ */}
      {isMobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex animate-in fade-in"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <div
            className="w-4/5 max-w-xs h-full bg-white dark:bg-slate-900 p-5 flex flex-col shadow-2xl border-r border-slate-200 dark:border-slate-800 animate-in slide-in-from-left duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-md">
                  <Sparkles className="w-4 h-4" />
                </div>
                <span className="font-bold text-base text-slate-800 dark:text-white">Socialix</span>
              </div>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Campaign info */}
            <div className="py-3">
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 flex items-center gap-2.5">
                <span className="text-xl">{campaignIcon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-slate-400 font-semibold uppercase">Active Campaign</p>
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{campaignName}</p>
                </div>
              </div>
            </div>

            {/* Links */}
            <div className="flex-1 py-2 space-y-1 overflow-y-auto">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-all ${
                      isActive
                        ? "bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-semibold"
                        : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>

            {/* Drawer Footer with Dark Mode */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <button
                onClick={toggleTheme}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700 cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  {theme === "dark" ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-blue-600" />}
                  <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
                </span>
                <span className="text-[11px] font-semibold text-slate-400 uppercase">{theme}</span>
              </button>

              <Link
                href="/dashboard/settings"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Settings className="w-4 h-4" />
                <span>Settings</span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
