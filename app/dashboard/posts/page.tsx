"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { CreatePostModal } from "@/components/CreatePostModal";
import {
  FileText,
  Calendar,
  CheckCircle2,
  Clock,
  Send,
  Trash2,
  ExternalLink,
  Users2,
  Share2,
  Sparkles,
  AlertCircle,
} from "lucide-react";

export default function PostsPage() {
  const [posts, setPosts] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"all" | "scheduled" | "draft" | "published">("all");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isPublishingId, setIsPublishingId] = useState<string | null>(null);

  const fetchPosts = async () => {
    try {
      const res = await fetch("/api/posts");
      const data = await res.json();
      if (data.posts) setPosts(data.posts);
    } catch (err) {
      console.error("Failed to fetch posts:", err);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  const handlePublishNow = async (postId: string) => {
    setIsPublishingId(postId);
    try {
      const res = await fetch("/api/posts/publish-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId }),
      });
      const data = await res.json();
      if (data.success) {
        fetchPosts();
      }
    } catch (err) {
      console.error("Locoagent instant publish error:", err);
    } finally {
      setIsPublishingId(null);
    }
  };

  const filteredPosts = posts.filter((p) => (activeTab === "all" ? true : p.status === activeTab));

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
          {/* Status Tabs Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-2xs overflow-x-auto">
              {[
                { id: "all", label: "All Posts", count: posts.length },
                { id: "scheduled", label: "Scheduled", count: posts.filter((p) => p.status === "scheduled").length },
                { id: "draft", label: "Drafts", count: posts.filter((p) => p.status === "draft").length },
                { id: "published", label: "Published", count: posts.filter((p) => p.status === "published").length },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === tab.id
                      ? "bg-blue-600 text-white shadow-xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                      activeTab === tab.id ? "bg-white/20 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-all cursor-pointer flex-shrink-0"
            >
              <Sparkles className="w-4 h-4" />
              <span>Compose with AI</span>
            </button>
          </div>

          {/* Posts Grid */}
          {filteredPosts.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-12 text-center text-slate-400">
              <FileText className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No posts in this view</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                Prompt the Master Agent in chat or click &apos;Compose with AI&apos; to schedule new posts.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredPosts.map((post) => {
                const media = JSON.parse(post.mediaUrls || "[]");
                const platforms = JSON.parse(post.platforms || "[]");
                const targetGroups = JSON.parse(post.targetGroups || "[]");
                const isPublishing = isPublishingId === post.id;

                return (
                  <div
                    key={post.id}
                    className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs overflow-hidden flex flex-col transition-all hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700"
                  >
                    {/* Media Thumbnail */}
                    <div className="h-44 bg-slate-100 dark:bg-slate-800 relative overflow-hidden">
                      {media[0] ? (
                        <img src={media[0]} alt={post.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 dark:text-slate-600">
                          <FileText className="w-8 h-8 mb-1" />
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
                            : "bg-slate-700/80 text-white"
                        }`}
                      >
                        ● {post.status}
                      </span>
                    </div>

                    {/* Content Details */}
                    <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                      <div>
                        <h4 className="font-bold text-sm text-slate-800 dark:text-white leading-snug line-clamp-1 mb-1">
                          {post.title}
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-3 leading-relaxed">{post.caption}</p>
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
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
                          {post.scheduledAt
                            ? `Scheduled: ${new Date(post.scheduledAt).toLocaleDateString([], {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}`
                            : post.publishedAt
                            ? `Published via Locoagent`
                            : "Draft"}
                        </span>

                        {post.status !== "published" && (
                          <button
                            onClick={() => handlePublishNow(post.id)}
                            disabled={isPublishing}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold shadow-xs transition-colors cursor-pointer"
                          >
                            <Send className="w-3 h-3" />
                            <span>{isPublishing ? "Locoagent Posting..." : "Publish Now"}</span>
                          </button>
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
