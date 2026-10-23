"use client";

import { Search, Bell, Plus } from "lucide-react";

interface HeaderProps {
  title?: string;
  subtitle?: string;
  onCreatePostClick?: () => void;
}

export function Header({
  title = "AI Agent",
  subtitle = "Brief your AI team and review what they're working on",
  onCreatePostClick,
}: HeaderProps) {
  return (
    <header className="h-16 bg-white border-b border-slate-100 flex items-center justify-between px-6 z-20">
      {/* Title */}
      <div>
        <h1 className="text-lg font-bold text-slate-800 leading-tight">{title}</h1>
        {subtitle && <p className="text-xs text-slate-400 font-medium">{subtitle}</p>}
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative hidden md:block">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search posts, campaigns..."
            className="w-64 pl-9 pr-10 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-400 bg-white border border-slate-200 px-1.5 py-0.5 rounded shadow-2xs">
            ⌘K
          </kbd>
        </div>

        {/* Notifications */}
        <button
          title="Notifications"
          className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors relative"
        >
          <Bell className="w-4 h-4" />
          <span className="w-2 h-2 bg-blue-600 rounded-full absolute top-2 right-2 ring-2 ring-white"></span>
        </button>

        {/* Create Post Button */}
        <button
          onClick={onCreatePostClick}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Create post</span>
        </button>

        {/* User Profile Avatar */}
        <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white font-bold text-sm flex items-center justify-center shadow-sm cursor-pointer select-none">
          S
        </div>
      </div>
    </header>
  );
}
