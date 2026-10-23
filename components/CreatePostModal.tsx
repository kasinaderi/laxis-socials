"use client";

import { useState } from "react";
import {
  X,
  Sparkles,
  Calendar,
  Send,
  Image as ImageIcon,
  Check,
  Hash,
  Users2,
  Share2,
} from "lucide-react";

interface CreatePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPostCreated?: () => void;
  campaignId?: string;
}

export function CreatePostModal({ isOpen, onClose, onPostCreated, campaignId = "default_campaign" }: CreatePostModalProps) {
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("#coffee #specialtycoffee #launch #latteart");
  const [imagePrompt, setImagePrompt] = useState("");
  const [generatedImageUrl, setGeneratedImageUrl] = useState("");
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [publishNow, setPublishNow] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Platform toggles
  const [platforms, setPlatforms] = useState<string[]>(["instagram", "facebook"]);
  const [targetGroup, setTargetGroup] = useState("Specialty Coffee Roasters & Enthusiasts (Facebook Group)");

  if (!isOpen) return null;

  const togglePlatform = (p: string) => {
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  };

  const handleGenerateAIImage = async () => {
    if (!imagePrompt.trim()) return;
    setIsGeneratingImage(true);
    try {
      // 100% Free Flux.1 via Pollinations
      const encoded = encodeURIComponent(imagePrompt.trim());
      const seed = Math.floor(Math.random() * 1000000);
      const url = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&seed=${seed}&model=flux&nologo=true`;
      setGeneratedImageUrl(url);
    } catch (e) {
      console.error(e);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !caption.trim()) return;

    setIsSubmitting(true);
    try {
      const parsedHashtags = hashtags
        .split(" ")
        .map((h) => h.trim())
        .filter(Boolean);

      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          title,
          caption,
          hashtags: parsedHashtags,
          mediaUrls: generatedImageUrl ? [generatedImageUrl] : [],
          platforms,
          targetGroups: [
            {
              platform: "facebook",
              groupName: targetGroup,
            },
          ],
          scheduledAt: publishNow ? null : scheduledAt || new Date(Date.now() + 3600000).toISOString(),
          publishNow,
        }),
      });

      if (res.ok) {
        onPostCreated?.();
        onClose();
      }
    } catch (err) {
      console.error("Failed to create post:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-2xl rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col my-8 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Create New Post</h3>
              <p className="text-xs text-slate-400">Post across profiles, pages, and groups via Locoagent</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-50">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Title */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Post Title</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Grand Opening Cold Brew Launch"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-700 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          {/* Platforms Picker */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">Destination Platforms & Groups</label>
            <div className="flex flex-wrap gap-2">
              {[
                { id: "instagram", name: "Instagram", icon: "📸" },
                { id: "facebook", name: "Facebook (Groups & Pages)", icon: "👥" },
                { id: "reddit", name: "Reddit (Subreddits)", icon: "🤖" },
                { id: "x", name: "X / Twitter", icon: "🐦" },
                { id: "linkedin", name: "LinkedIn", icon: "💼" },
                { id: "tiktok", name: "TikTok", icon: "🎵" },
              ].map((pl) => {
                const selected = platforms.includes(pl.id);
                return (
                  <button
                    key={pl.id}
                    type="button"
                    onClick={() => togglePlatform(pl.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      selected
                        ? "bg-blue-50 border-blue-300 text-blue-700 shadow-2xs"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span>{pl.icon}</span>
                    <span>{pl.name}</span>
                    {selected && <Check className="w-3.5 h-3.5 text-blue-600 ml-1" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Group Target Input if Facebook/Reddit selected */}
          {platforms.includes("facebook") && (
            <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-200/80 space-y-1.5">
              <span className="text-xs font-bold text-blue-800 flex items-center gap-1.5">
                <Users2 className="w-3.5 h-3.5 text-blue-600" />
                Target Facebook Group (Locoagent Autonomous Browser Automation)
              </span>
              <input
                type="text"
                value={targetGroup}
                onChange={(e) => setTargetGroup(e.target.value)}
                placeholder="Group name or URL, e.g. Specialty Coffee Roasters"
                className="w-full bg-white border border-blue-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none"
              />
              <p className="text-[10px] text-blue-600">
                Locoagent navigates into this group inside an isolated Chromium sandbox and posts without enterprise API restrictions.
              </p>
            </div>
          )}

          {/* Caption */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Caption / Body Copy</label>
            <textarea
              required
              rows={4}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Write the engaging hook, story, and call to action..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-700 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          {/* Hashtags */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1 flex items-center gap-1">
              <Hash className="w-3.5 h-3.5 text-slate-400" />
              Hashtags
            </label>
            <input
              type="text"
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Visual Asset Generator (Pollinations Flux.1 100% Free) */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-purple-600" />
              Generate Social Media Image (100% Free AI Generator)
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                placeholder="e.g. Delicious iced latte with coffee beans and warm wooden coffee shop atmosphere"
                className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700"
              />
              <button
                type="button"
                onClick={handleGenerateAIImage}
                disabled={isGeneratingImage || !imagePrompt.trim()}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {isGeneratingImage ? "Generating..." : "Generate Flux Image"}
              </button>
            </div>
            {generatedImageUrl && (
              <div className="mt-2 w-32 h-32 rounded-lg border border-slate-200 overflow-hidden relative shadow-xs">
                <img src={generatedImageUrl} alt="Generated visual" className="w-full h-full object-cover" />
              </div>
            )}
          </div>

          {/* Schedule or Instant Publish */}
          <div className="flex items-center justify-between p-3 bg-slate-100/70 rounded-xl text-xs">
            <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={publishNow}
                onChange={(e) => setPublishNow(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600"
              />
              <span>Publish Immediately via Locoagent</span>
            </label>
            {!publishNow && (
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400" />
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700"
                />
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 active:scale-95 text-white shadow-md shadow-blue-500/20 cursor-pointer"
            >
              {isSubmitting ? "Processing..." : publishNow ? "Publish Now" : "Schedule Post"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
