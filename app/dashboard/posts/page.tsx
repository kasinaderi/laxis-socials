"use client";

import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { CreatePostModal } from "@/components/CreatePostModal";
import {
  FileText,
  CheckCircle2,
  Clock,
  Send,
  Trash2,
  Users2,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  ThumbsUp,
  Zap,
  X,
  Image as ImageIcon,
  RefreshCw,
} from "lucide-react";

type TabId = "all" | "scheduled" | "pending_approval" | "draft" | "published";

export default function PostsPage() {
  const [posts, setPosts] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>("all");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isPublishingId, setIsPublishingId] = useState<string | null>(null);
  const [isApprovingId, setIsApprovingId] = useState<string | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [autoApprove, setAutoApprove] = useState(false);
  const [autoApproveLoading, setAutoApproveLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchPosts = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/posts");
      const data = await res.json();
      if (data.posts) setPosts(data.posts);
    } catch (err) {
      console.error("Failed to fetch posts:", err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const fetchAutoApprove = useCallback(async () => {
    try {
      const res = await fetch("/api/posts/config");
      const data = await res.json();
      setAutoApprove(!!data.autoApprove);
    } catch (err) {
      console.error("Failed to fetch auto-approve setting:", err);
    }
  }, []);

  useEffect(() => {
    fetchPosts();
    fetchAutoApprove();
  }, [fetchPosts, fetchAutoApprove]);

  const handleToggleAutoApprove = async () => {
    setAutoApproveLoading(true);
    const newVal = !autoApprove;
    try {
      await fetch("/api/posts/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoApprove: newVal }),
      });
      setAutoApprove(newVal);
      if (newVal) fetchPosts(); // bulk-approved posts may change tab counts
    } catch (err) {
      console.error("Failed to update auto-approve:", err);
    } finally {
      setAutoApproveLoading(false);
    }
  };

  const handlePublishNow = async (postId: string) => {
    setIsPublishingId(postId);
    try {
      const res = await fetch("/api/posts/publish-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId }),
      });
      const data = await res.json();
      if (data.success) fetchPosts();
    } catch (err) {
      console.error("Locoagent instant publish error:", err);
    } finally {
      setIsPublishingId(null);
    }
  };

  const handleApprove = async (postId: string) => {
    setIsApprovingId(postId);
    try {
      const res = await fetch("/api/posts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: postId, status: "scheduled" }),
      });
      if (res.ok) fetchPosts();
    } catch (err) {
      console.error("Approve error:", err);
    } finally {
      setIsApprovingId(null);
    }
  };

  const handleDelete = async (postId: string) => {
    setIsDeletingId(postId);
    try {
      const res = await fetch(`/api/posts`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: postId }),
      });
      if (res.ok) fetchPosts();
    } catch (err) {
      console.error("Delete error:", err);
    } finally {
      setIsDeletingId(null);
    }
  };

  const pendingCount = posts.filter((p) => p.status === "pending_approval").length;

  const tabs: { id: TabId; label: string; count: number; color?: string }[] = [
    { id: "all", label: "All Posts", count: posts.length },
    {
      id: "pending_approval",
      label: "⏳ Pending Approval",
      count: pendingCount,
      color: pendingCount > 0 ? "amber" : undefined,
    },
    { id: "scheduled", label: "Scheduled", count: posts.filter((p) => p.status === "scheduled").length },
    { id: "draft", label: "Drafts", count: posts.filter((p) => p.status === "draft").length },
    { id: "published", label: "Published", count: posts.filter((p) => p.status === "published").length },
  ];

  const filteredPosts = posts.filter((p) =>
    activeTab === "all" ? true : p.status === activeTab
  );

  return (
    <div className="flex h-screen bg-slate-100/60 dark:bg-slate-950 overflow-hidden font-sans transition-colors">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header
          title="Content Library & Posts"
          subtitle="Manage all AI-generated drafts, scheduled campaigns, and published social posts"
          onCreatePostClick={() => setIsCreateModalOpen(true)}
        />

        <main className="flex-1 p-4 sm:p-6 overflow-y-auto pb-24 lg:pb-6">

          {/* Auto-Approve Toggle Banner */}
          <div
            className={`flex items-center justify-between gap-4 mb-5 px-4 py-3 rounded-2xl border transition-all ${
              autoApprove
                ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200/80 dark:border-emerald-800/60"
                : "bg-amber-50 dark:bg-amber-950/30 border-amber-200/60 dark:border-amber-800/40"
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              {autoApprove ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
              ) : (
                <Clock className="w-5 h-5 text-amber-500 flex-shrink-0" />
              )}
              <div className="min-w-0">
                <p className={`text-sm font-bold ${autoApprove ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>
                  Auto-Approve is {autoApprove ? "ON" : "OFF"}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {autoApprove
                    ? "All new posts are auto-scheduled without review."
                    : "New posts land in Pending Approval — you review before they go live."}
                </p>
              </div>
            </div>

            <button
              onClick={handleToggleAutoApprove}
              disabled={autoApproveLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex-shrink-0 shadow-sm disabled:opacity-60"
              style={{
                background: autoApprove ? "#10b981" : "#6b7280",
                color: "#fff",
              }}
            >
              {autoApprove ? (
                <ToggleRight className="w-4 h-4" />
              ) : (
                <ToggleLeft className="w-4 h-4" />
              )}
              {autoApproveLoading ? "Saving..." : autoApprove ? "Turn OFF" : "Turn ON"}
            </button>
          </div>

          {/* Status Tabs Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-2xs overflow-x-auto">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                const isAmber = tab.color === "amber" && !isActive;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                      isActive
                        ? tab.id === "pending_approval"
                          ? "bg-amber-500 text-white shadow-xs"
                          : "bg-blue-600 text-white shadow-xs"
                        : isAmber
                        ? "text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`px-1.5 rounded-full text-[10px] ${
                        isActive
                          ? "bg-white/25 text-white"
                          : isAmber
                          ? "bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-300"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={fetchPosts}
                disabled={isRefreshing}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold rounded-xl transition-all cursor-pointer disabled:opacity-60"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                Refresh
              </button>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-all cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>Compose with AI</span>
              </button>
            </div>
          </div>

          {/* Pending Approval Helper Banner */}
          {activeTab === "pending_approval" && filteredPosts.length > 0 && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 text-xs text-amber-700 dark:text-amber-300 font-medium flex items-center gap-2">
              <ThumbsUp className="w-4 h-4 flex-shrink-0" />
              <span>
                {filteredPosts.length} post{filteredPosts.length !== 1 ? "s" : ""} waiting for your approval.
                Approve to schedule, or Publish Now to go live immediately.
              </span>
            </div>
          )}

          {/* Posts Grid */}
          {filteredPosts.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-12 text-center text-slate-400">
              <FileText className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {activeTab === "pending_approval" ? "No posts waiting for approval 🎉" : "No posts in this view"}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                {activeTab === "pending_approval"
                  ? "All posts are auto-approved or none have been generated yet."
                  : "Prompt the Master Agent in chat or click 'Compose with AI' to schedule new posts."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredPosts.map((post) => {
                const media = JSON.parse(post.mediaUrls || "[]");
                const platforms = JSON.parse(post.platforms || "[]");
                const targetGroups = JSON.parse(post.targetGroups || "[]");
                const isPublishing = isPublishingId === post.id;
                const isApproving = isApprovingId === post.id;
                const isDeleting = isDeletingId === post.id;
                const isPending = post.status === "pending_approval";

                return (
                  <div
                    key={post.id}
                    className={`bg-white dark:bg-slate-900 rounded-2xl border shadow-2xs overflow-hidden flex flex-col transition-all hover:shadow-md ${
                      isPending
                        ? "border-amber-300/80 dark:border-amber-700/60 ring-1 ring-amber-200/60 dark:ring-amber-800/30"
                        : "border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                    }`}
                  >
                    {/* Media Thumbnail */}
                    <div className="h-44 bg-slate-100 dark:bg-slate-800 relative overflow-hidden">
                      {media[0] ? (
                        <img src={media[0]} alt={post.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 dark:text-slate-600">
                          <ImageIcon className="w-8 h-8 mb-1" />
                          <span className="text-xs font-medium">Text Only Post</span>
                        </div>
                      )}

                      {/* Status Badge */}
                      <span
                        className={`absolute top-3 right-3 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider backdrop-blur-md shadow-xs ${
                          post.status === "published"
                            ? "bg-emerald-500/90 text-white"
                            : post.status === "scheduled"
                            ? "bg-blue-600/90 text-white"
                            : post.status === "pending_approval"
                            ? "bg-amber-500/90 text-white"
                            : "bg-slate-700/80 text-white"
                        }`}
                      >
                        {post.status === "pending_approval" ? "⏳ Pending" : `● ${post.status}`}
                      </span>
                    </div>

                    {/* Content Details */}
                    <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                      <div>
                        <h4 className="font-bold text-sm text-slate-800 dark:text-white leading-snug line-clamp-1 mb-1">
                          {post.title}
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-3 leading-relaxed">
                          {post.caption}
                        </p>
                      </div>

                      {/* Group and Platform Badges */}
                      <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                        <div className="flex flex-wrap gap-1.5">
                          {platforms.map((pl: string) => (
                            <span
                              key={pl}
                              className="text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-md capitalize"
                            >
                              {pl}
                            </span>
                          ))}
                        </div>

                        {targetGroups.length > 0 && (
                          <div className="flex items-center gap-1 text-[10px] text-blue-700 dark:text-blue-300 bg-blue-50/70 dark:bg-blue-950/50 p-1.5 rounded-lg border border-blue-100/60 dark:border-blue-900/40 font-medium">
                            <Users2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                            <span className="truncate">Group: {targetGroups[0].groupName || "Community"}</span>
                          </div>
                        )}
                      </div>

                      {/* Post Actions */}
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                        <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 block mb-2">
                          {post.scheduledAt
                            ? `Scheduled: ${new Date(post.scheduledAt).toLocaleDateString([], {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}`
                            : post.publishedAt
                            ? "Published via Locoagent"
                            : "Draft"}
                        </span>

                        {/* Pending Approval Actions */}
                        {isPending && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleApprove(post.id)}
                              disabled={isApproving || isPublishing}
                              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-60"
                            >
                              <ThumbsUp className="w-3 h-3" />
                              {isApproving ? "Approving..." : "Approve"}
                            </button>
                            <button
                              onClick={() => handlePublishNow(post.id)}
                              disabled={isPublishing || isApproving}
                              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-60"
                            >
                              <Zap className="w-3 h-3" />
                              {isPublishing ? "Posting..." : "Publish Now"}
                            </button>
                            <button
                              onClick={() => handleDelete(post.id)}
                              disabled={isDeleting}
                              className="flex items-center justify-center p-1.5 rounded-xl bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-500 transition-colors cursor-pointer disabled:opacity-60"
                              title="Reject & Delete"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        {/* Normal (non-pending) Actions */}
                        {!isPending && post.status !== "published" && (
                          <div className="flex items-center justify-between">
                            <button
                              onClick={() => handlePublishNow(post.id)}
                              disabled={isPublishing}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-60"
                            >
                              <Send className="w-3 h-3" />
                              <span>{isPublishing ? "Locoagent Posting..." : "Publish Now"}</span>
                            </button>
                            <button
                              onClick={() => handleDelete(post.id)}
                              disabled={isDeleting}
                              className="flex items-center justify-center p-1.5 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      <CreatePostModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onPostCreated={fetchPosts}
      />
    </div>
  );
}
