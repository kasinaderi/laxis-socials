"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { CreatePostModal } from "@/components/CreatePostModal";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Send,
  Plus,
  Share2,
  Users2,
} from "lucide-react";

export default function CalendarPage() {
  const [posts, setPosts] = useState<any[]>([]);
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date("2026-10-01"));
  const [selectedPost, setSelectedPost] = useState<any | null>(null);
  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const fetchPosts = async () => {
    try {
      const res = await fetch("/api/posts");
      const data = await res.json();
      if (data.posts) setPosts(data.posts);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    setCurrentDate(new Date());
    fetchPosts();
  }, []);

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayIndex = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blankDays = Array.from({ length: firstDayIndex }, (_, i) => i);

  return (
    <div className="flex h-screen bg-slate-100/60 dark:bg-slate-950 overflow-hidden font-sans transition-colors">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header
          title="Content Calendar"
          subtitle="Visualize and reschedule automated posts across all connected profiles and groups"
          onCreatePostClick={() => setIsCreateModalOpen(true)}
        />

        <main className="flex-1 p-4 sm:p-6 overflow-y-auto flex flex-col pb-24 lg:pb-6">
          {/* Calendar Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-bold text-slate-800 dark:text-white">
                {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
              </h2>
              <div className="flex items-center gap-1">
                <button
                  onClick={handlePrevMonth}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={handleNextMonth}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-semibold">
                <button
                  onClick={() => setViewMode("month")}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    viewMode === "month"
                      ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-2xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  Month
                </button>
                <button
                  onClick={() => setViewMode("week")}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    viewMode === "week"
                      ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-2xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  Week
                </button>
              </div>

              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Post</span>
              </button>
            </div>
          </div>

          {/* Month Calendar Grid */}
          <div className="flex-1 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs overflow-hidden flex flex-col min-h-[380px]">
            {/* Weekday Header */}
            <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850 text-center text-xs font-bold text-slate-500 dark:text-slate-400 py-2.5">
              <span>Sun</span>
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
              <span>Sat</span>
            </div>

            {/* Days Grid */}
            <div className="flex-1 grid grid-cols-7 grid-rows-5 gap-px bg-slate-100 dark:bg-slate-800 overflow-y-auto">
              {blankDays.map((i) => (
                <div key={`blank-${i}`} className="bg-slate-50/40 dark:bg-slate-900/60 min-h-[90px] p-2" />
              ))}
              {daysArray.map((day) => {
                const dayPosts = posts.filter((p) => {
                  if (!p.scheduledAt) return false;
                  const d = new Date(p.scheduledAt);
                  return (
                    d.getDate() === day &&
                    d.getMonth() === currentDate.getMonth() &&
                    d.getFullYear() === currentDate.getFullYear()
                  );
                });

                const isToday =
                  day === new Date().getDate() &&
                  currentDate.getMonth() === new Date().getMonth() &&
                  currentDate.getFullYear() === new Date().getFullYear();

                return (
                  <div
                    key={`day-${day}`}
                    className={`bg-white dark:bg-slate-900 min-h-[90px] p-2 flex flex-col justify-between transition-colors hover:bg-blue-50/20 dark:hover:bg-slate-800/50 ${
                      isToday ? "ring-2 ring-blue-500/30 inset-0" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={`text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center ${
                          isToday ? "bg-blue-600 text-white" : "text-slate-700 dark:text-slate-200"
                        }`}
                      >
                        {day}
                      </span>
                      {dayPosts.length > 0 && (
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">{dayPosts.length} post</span>
                      )}
                    </div>

                    <div className="space-y-1 overflow-y-auto max-h-16">
                      {dayPosts.map((post) => (
                        <div
                          key={post.id}
                          onClick={() => setSelectedPost(post)}
                          className="p-1 rounded bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100/80 dark:hover:bg-blue-900/60 border border-blue-200/80 dark:border-blue-900/60 text-[10px] text-blue-800 dark:text-blue-300 font-semibold truncate cursor-pointer transition-colors flex items-center gap-1"
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                              post.status === "published" ? "bg-emerald-500" : "bg-blue-500"
                            }`}
                          />
                          <span className="truncate">{post.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      </div>

      {/* Selected Post Detail Slide-over modal */}
      {selectedPost && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-sm text-slate-800 dark:text-white">{selectedPost.title}</h3>
              <button
                onClick={() => setSelectedPost(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {JSON.parse(selectedPost.mediaUrls || "[]")[0] && (
              <div className="w-full h-44 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                <img
                  src={JSON.parse(selectedPost.mediaUrls)[0]}
                  alt="Post visual"
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-100 dark:border-slate-700 whitespace-pre-wrap">
              {selectedPost.caption}
            </p>

            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
              <span className="capitalize font-semibold text-blue-600 dark:text-blue-400">● {selectedPost.status}</span>
              <span>{new Date(selectedPost.scheduledAt).toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      <CreatePostModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onPostCreated={fetchPosts}
      />
    </div>
  );
}
