"use client";

import { useState, useEffect, useRef } from "react";
import {
  MessageSquare,
  ListTodo,
  Monitor,
  Settings,
  Send,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Laptop,
  Maximize2,
  Minimize2,
  Lock,
  Globe,
  Save,
  X,
  RefreshCw,
  Power,
  AlertTriangle,
  Image as ImageIcon,
  Download,
  ZoomIn,
  Paperclip,
  Trash2,
  MoreVertical,
  CheckSquare,
  Square,
  Keyboard,
  Plus,
  ChevronDown,
  ChevronUp,
  CornerDownLeft,
  Clipboard,
  Terminal,
  DownloadCloud,
  Check,
} from "lucide-react";

interface AgentTabsProps {
  agentId: string;
  agentName: string;
  agentRole: string;
  agentStatus: "idle" | "running" | "done" | "paused";
  avatar: string;
  campaignId?: string;
}

const AGENT_NICHE_SHORTCUTS: Record<string, { label: string; url: string; color?: string }[]> = {
  fb_laxdollar: [
    { label: "laxdollar.site", url: "https://laxdollar.site", color: "emerald" },
    { label: "Deriv Portal", url: "https://track.deriv.com", color: "blue" },
    { label: "Facebook Groups", url: "https://facebook.com/groups", color: "sky" },
    { label: "Facebook Login", url: "https://facebook.com", color: "slate" },
  ],
  fb_jotrainer: [
    { label: "Remotasks", url: "https://remotasks.com", color: "indigo" },
    { label: "Outlier AI", url: "https://outlier.ai", color: "purple" },
    { label: "Facebook Jobs", url: "https://facebook.com/jobs", color: "blue" },
    { label: "Facebook Login", url: "https://facebook.com", color: "slate" },
  ],
  fb_contentor: [
    { label: "Facebook Reels", url: "https://facebook.com/reels", color: "pink" },
    { label: "Trending Memes", url: "https://knowyourmeme.com", color: "amber" },
    { label: "Facebook Feed", url: "https://facebook.com", color: "slate" },
  ],
  ig_real: [
    { label: "Instagram Login", url: "https://instagram.com", color: "pink" },
    { label: "Confessions Explore", url: "https://instagram.com/explore", color: "rose" },
    { label: "Meta Business", url: "https://business.facebook.com", color: "blue" },
  ],
  ig_shader: [
    { label: "Instagram Login", url: "https://instagram.com", color: "pink" },
    { label: "The Shade Room", url: "https://theshaderoom.com", color: "amber" },
    { label: "Pop News Scoops", url: "https://x.com/explore", color: "sky" },
  ],
  analytics_agent: [
    { label: "Meta Insights", url: "https://business.facebook.com/insights", color: "blue" },
    { label: "Google Trends", url: "https://trends.google.com", color: "emerald" },
    { label: "Verify Cloud IP", url: "https://whoer.net", color: "amber" },
  ],
  master: [
    { label: "Verify Cloud IP", url: "https://whoer.net", color: "amber" },
    { label: "Google Trends", url: "https://trends.google.com", color: "emerald" },
    { label: "Meta Suite", url: "https://business.facebook.com", color: "blue" },
  ],
};

export function AgentTabs({
  agentId,
  agentName,
  agentRole,
  agentStatus = "idle",
  avatar,
  campaignId = "default_campaign",
}: AgentTabsProps) {
  const [activeTab, setActiveTab] = useState<"chat" | "tasks" | "computer" | "settings">(
    agentId === "master" ? "chat" : "computer"
  );
  interface ChatMsg {
    id: string;
    sender: string;
    text: string;
    metadata?: string | null;
    createdAt: string;
  }

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Chat Image Attachments & HD Preview Modal
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [showUrlPrompt, setShowUrlPrompt] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Computer Tab & E2B Cloud Desktop state
  const [isTakeOver, setIsTakeOver] = useState(false);
  const [isFullscreenModal, setIsFullscreenModal] = useState(false);
  const [isPaused, setIsPaused] = useState(true); // Default to paused to protect credits!
  const [sandboxInfo, setSandboxInfo] = useState<any>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [customUrl, setCustomUrl] = useState("https://facebook.com");
  const [cookieSavedNotification, setCookieSavedNotification] = useState(false);

  // Agent Niche Shortcuts & Virtual Keyboard Helper
  const [shortcuts, setShortcuts] = useState<{ label: string; url: string; color?: string }[]>([]);
  const [isShortcutsCollapsed, setIsShortcutsCollapsed] = useState(false);
  const [isEditingShortcuts, setIsEditingShortcuts] = useState(false);
  const [showAddShortcutModal, setShowAddShortcutModal] = useState(false);
  const [newShortcutLabel, setNewShortcutLabel] = useState("");
  const [newShortcutUrl, setNewShortcutUrl] = useState("");

  // Virtual / Mobile Keyboard Helper
  const [showKeyboardHelper, setShowKeyboardHelper] = useState(false);
  const [keyboardInputText, setKeyboardInputText] = useState("");
  const [isSendingKey, setIsSendingKey] = useState(false);
  const mobileInputRef = useRef<HTMLInputElement>(null);

  // Sync shortcuts & default tab when agentId changes
  useEffect(() => {
    if (agentId === "master") {
      setActiveTab("chat");
    }
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(`shortcuts_${agentId}`);
        if (stored) {
          setShortcuts(JSON.parse(stored));
          return;
        }
      } catch (err) {
        // fallback
      }
    }
    setShortcuts(AGENT_NICHE_SHORTCUTS[agentId] || AGENT_NICHE_SHORTCUTS.master);
  }, [agentId]);

  const saveShortcuts = (updated: { label: string; url: string; color?: string }[]) => {
    setShortcuts(updated);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(`shortcuts_${agentId}`, JSON.stringify(updated));
      } catch {}
    }
  };

  const handleAddShortcut = () => {
    if (!newShortcutLabel.trim() || !newShortcutUrl.trim()) return;
    let url = newShortcutUrl.trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }
    const updated = [...shortcuts, { label: newShortcutLabel.trim(), url, color: "slate" }];
    saveShortcuts(updated);
    setNewShortcutLabel("");
    setNewShortcutUrl("");
    setShowAddShortcutModal(false);
  };

  const handleDeleteShortcut = (index: number) => {
    const updated = shortcuts.filter((_, i) => i !== index);
    saveShortcuts(updated);
  };

  const handleClearAllShortcuts = () => {
    if (window.confirm("Clear all shortcuts for this agent?")) {
      saveShortcuts([]);
    }
  };

  const handleResetDefaultShortcuts = () => {
    const defaults = AGENT_NICHE_SHORTCUTS[agentId] || AGENT_NICHE_SHORTCUTS.master;
    saveShortcuts(defaults);
  };

  const handleSendKeyboardText = async () => {
    if (!keyboardInputText) return;
    const textToSend = keyboardInputText;
    setKeyboardInputText("");
    setIsSendingKey(true);
    try {
      await fetch("/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "type",
          agentId,
          campaignId,
          text: textToSend,
        }),
      });
    } catch (err) {
      console.error("Failed to send text to sandbox:", err);
    } finally {
      setIsSendingKey(false);
      mobileInputRef.current?.focus();
    }
  };

  // 10-Minute Idle Detection & Auto-Pause state
  const [isIdlePaused, setIsIdlePaused] = useState(false);
  const [streamKey, setStreamKey] = useState<number>(0);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastActiveTimeRef = useRef<number>(Date.now());
  const heartbeatTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Host PC Clipboard Paste state
  const [pasteSuccessToast, setPasteSuccessToast] = useState<string | null>(null);
  const [isPasting, setIsPasting] = useState(false);

  // Send text directly into Agent PC & Linux X11 clipboard
  const handlePasteDirect = async (text: string) => {
    if (!text) return;
    setIsPasting(true);
    try {
      const res = await fetch("/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "paste",
          agentId,
          campaignId,
          text,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPasteSuccessToast(`✓ Pasted from PC: "${text.slice(0, 20)}${text.length > 20 ? "..." : ""}"`);
        setTimeout(() => setPasteSuccessToast(null), 3000);
      }
    } catch (err) {
      console.error("Paste error:", err);
    } finally {
      setIsPasting(false);
    }
  };

  // Button to paste from PC clipboard
  const handlePasteFromDeviceClipboard = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          await handlePasteDirect(text);
          return;
        }
      }
    } catch (err) {
      console.warn("Clipboard permission issue:", err);
    }
    const manual = window.prompt("Paste text from your PC to send directly into Agent PC:");
    if (manual) {
      await handlePasteDirect(manual);
    }
  };

  // Reconnect / Wake Sandbox handler
  const handleWakeAndReconnect = async () => {
    setIsIdlePaused(false);
    setIsPaused(false);
    lastActiveTimeRef.current = Date.now();
    setStreamKey((k) => k + 1);
    try {
      const res = await fetch("/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "turn_on",
          agentId,
          campaignId,
        }),
      });
      const data = await res.json();
      if (data.streamUrl) {
        setSandboxInfo(data);
      }
    } catch (err) {
      console.error("Wake and reconnect error:", err);
    }
  };

  // Listen for host Ctrl+V paste event when modal is open
  useEffect(() => {
    if (!isFullscreenModal) return;

    const onGlobalPaste = async (e: ClipboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      const text = e.clipboardData?.getData("text");
      if (text) {
        e.preventDefault();
        await handlePasteDirect(text);
      }
    };

    window.addEventListener("paste", onGlobalPaste);
    return () => window.removeEventListener("paste", onGlobalPaste);
  }, [isFullscreenModal, agentId]);

  // Track user activity, heartbeat keepalive, and 10-minute idle pause (with iframe focus protection)
  useEffect(() => {
    if (!isFullscreenModal || isPaused || isIdlePaused) {
      if (idleTimerRef.current) clearInterval(idleTimerRef.current);
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      return;
    }

    lastActiveTimeRef.current = Date.now();

    // Heartbeat every 30s to keep microVM alive while user is active
    heartbeatTimerRef.current = setInterval(() => {
      fetch("/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "heartbeat",
          agentId,
          campaignId,
        }),
      }).catch(() => {});
    }, 30000);

    const onUserActivity = () => {
      lastActiveTimeRef.current = Date.now();
    };

    // When user clicks inside iframe, window triggers blur: record activity!
    const onWindowBlur = () => {
      lastActiveTimeRef.current = Date.now();
    };

    // Idle checker running every 5 seconds (10 min idle threshold = 600,000ms)
    idleTimerRef.current = setInterval(async () => {
      // If user is currently focused on the VNC iframe, keep alive!
      if (typeof document !== "undefined" && document.activeElement?.tagName === "IFRAME") {
        lastActiveTimeRef.current = Date.now();
        return;
      }

      const idleDuration = Date.now() - lastActiveTimeRef.current;
      if (idleDuration >= 600000) {
        // 10 minutes of true idle detected!
        console.log(`[Agent PC] 10 minutes idle detected. Pausing microVM for ${agentId}...`);
        setIsIdlePaused(true);
        setIsPaused(true);
        try {
          await fetch("/api/sandbox", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "pause",
              agentId,
              campaignId,
            }),
          });
        } catch (err) {
          console.error("Auto pause error:", err);
        }
      }
    }, 5000);

    window.addEventListener("mousemove", onUserActivity, { passive: true });
    window.addEventListener("keydown", onUserActivity, { passive: true });
    window.addEventListener("click", onUserActivity, { passive: true });
    window.addEventListener("touchstart", onUserActivity, { passive: true });
    window.addEventListener("blur", onWindowBlur);

    return () => {
      if (idleTimerRef.current) clearInterval(idleTimerRef.current);
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      window.removeEventListener("mousemove", onUserActivity);
      window.removeEventListener("keydown", onUserActivity);
      window.removeEventListener("click", onUserActivity);
      window.removeEventListener("touchstart", onUserActivity);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [isFullscreenModal, isPaused, isIdlePaused, agentId]);

  const handleSendSpecialKey = async (key: string) => {
    setIsSendingKey(true);
    try {
      await fetch("/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "key",
          agentId,
          campaignId,
          key,
        }),
      });
    } catch (err) {
      console.error("Failed to send key to sandbox:", err);
    } finally {
      setIsSendingKey(false);
      mobileInputRef.current?.focus();
    }
  };

  // Tasks Tab state
  const [tasks, setTasks] = useState<any[]>([]);

  // Chat Management & Deletion State
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [showChatOptionsMenu, setShowChatOptionsMenu] = useState(false);

  const handleDeleteSingleMessage = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setMessages((prev) => prev.filter((m) => m.id !== id));
    setSelectedMessageIds((prev) => prev.filter((item) => item !== id));
    try {
      await fetch(`/api/chat?id=${id}&campaignId=${campaignId}`, { method: "DELETE" });
    } catch (err) {
      console.error("Failed to delete message:", err);
    }
  };

  const handleDeleteSelectedMessages = async () => {
    if (selectedMessageIds.length === 0) return;
    const toDelete = [...selectedMessageIds];
    setMessages((prev) => prev.filter((m) => !toDelete.includes(m.id)));
    setSelectedMessageIds([]);
    setIsMultiSelectMode(false);
    try {
      await fetch("/api/chat", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageIds: toDelete, campaignId }),
      });
    } catch (err) {
      console.error("Failed to delete selected messages:", err);
    }
  };

  const handleClearWholeChat = async () => {
    if (!window.confirm(`Clear entire conversation with ${agentName}? This cannot be undone.`)) return;
    setMessages([]);
    setSelectedMessageIds([]);
    setIsMultiSelectMode(false);
    setShowChatOptionsMenu(false);
    try {
      await fetch(`/api/chat?clearAll=true&agentId=${agentId}&campaignId=${campaignId}`, {
        method: "DELETE",
      });
    } catch (err) {
      console.error("Failed to clear chat:", err);
    }
  };

  const toggleSelectMessage = (id: string) => {
    setSelectedMessageIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedMessageIds.length === messages.length && messages.length > 0) {
      setSelectedMessageIds([]);
    } else {
      setSelectedMessageIds(messages.map((m) => m.id));
    }
  };

  const chatEndRef = useRef<HTMLDivElement>(null);

  const getMessageMedia = (m: ChatMsg): { url?: string; type?: string; title?: string } => {
    if (m.metadata) {
      try {
        const parsed = typeof m.metadata === "string" ? JSON.parse(m.metadata) : m.metadata;
        if (parsed?.mediaUrl) {
          return { url: parsed.mediaUrl, type: parsed.type || "image", title: parsed.title };
        }
      } catch {
        // ignore
      }
    }
    // Fallback: match image URLs inside text
    const match = m.text.match(
      /(https?:\/\/[^\s]+(?:\.png|\.jpg|\.jpeg|\.webp|\.gif)(?:\?[^\s]*)?|https:\/\/image\.pollinations\.ai\/prompt\/[^\s]+)/i
    );
    if (match) {
      return { url: match[1], type: "image" };
    }
    return {};
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setAttachedImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Fetch messages
  const fetchMessages = async () => {
    try {
      const res = await fetch(`/api/chat?agentId=${agentId}&campaignId=${campaignId}`);
      const data = await res.json();
      if (data.messages) {
        setMessages(data.messages);
      }
    } catch (err) {
      console.error("Failed to fetch messages:", err);
    }
  };

  // Fetch tasks
  const fetchTasks = async () => {
    try {
      const res = await fetch(`/api/agents?campaignId=${campaignId}`);
      const data = await res.json();
      if (data.tasks) {
        setTasks(data.tasks.filter((t: any) => t.agentId === agentId || agentId === "master"));
      }
    } catch (err) {
      console.error("Failed to fetch tasks:", err);
    }
  };

  // Fetch sandbox info (strictly read-only)
  const fetchSandbox = async () => {
    try {
      const res = await fetch(`/api/sandbox?agentId=${agentId}&campaignId=${campaignId}`);
      const data = await res.json();
      setSandboxInfo(data);
      if (data.control === "user") setIsTakeOver(true);
      setIsPaused(data.status === "paused" || data.status === "none");
    } catch (err) {
      console.error("Failed to fetch sandbox:", err);
    }
  };

  useEffect(() => {
    fetchMessages();
    fetchTasks();
    fetchSandbox();
  }, [agentId, campaignId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!inputText.trim() && !attachedImage) || isLoading) return;

    const userText = inputText.trim();
    const userImage = attachedImage;
    setInputText("");
    setAttachedImage(null);
    setShowUrlPrompt(false);
    setIsLoading(true);

    setMessages((prev) => [
      ...prev,
      {
        id: `temp_${Date.now()}`,
        sender: "user",
        text: userText || (userImage ? "Attached visual asset for review / campaign generation" : ""),
        metadata: userImage ? JSON.stringify({ mediaUrl: userImage }) : null,
        createdAt: new Date().toISOString(),
      },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          campaignId,
          text: userText,
          mediaUrl: userImage,
        }),
      });
      const data = await res.json();
      if (data.reply) {
        setMessages((prev) => [
          ...prev,
          {
            id: `reply_${Date.now()}`,
            sender: agentId,
            text: data.reply,
            metadata: data.mediaUrl ? JSON.stringify({ mediaUrl: data.mediaUrl }) : null,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
      fetchTasks();
    } catch (err) {
      console.error("Failed to send message:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTakeOverToggle = async () => {
    const nextState = !isTakeOver;
    setIsTakeOver(nextState);
    if (nextState) {
      setIsFullscreenModal(true);
    }
    // Launch E2B sandbox on explicit user request
    const res = await fetch("/api/sandbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "takeover",
        agentId,
        campaignId,
        value: nextState,
      }),
    });
    const data = await res.json();
    setSandboxInfo(data);
    setIsPaused(false);
  };

  const handleNavigate = async (targetUrl: string) => {
    setCustomUrl(targetUrl);
    setIsNavigating(true);
    try {
      await fetch("/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "navigate",
          agentId,
          campaignId,
          url: targetUrl,
        }),
      });
      setTimeout(() => {
        fetchSandbox();
        setIsNavigating(false);
      }, 1500);
    } catch (e) {
      setIsNavigating(false);
    }
  };

  const handleSaveAndHibernate = async () => {
    setCookieSavedNotification(true);
    await fetch("/api/sandbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save_and_sleep",
        agentId,
        campaignId,
      }),
    });
    setIsTakeOver(false);
    setIsFullscreenModal(false);
    setIsPaused(true);
    fetchSandbox();
    setTimeout(() => setCookieSavedNotification(false), 5000);
  };

  const handlePauseToggle = async () => {
    const nextPaused = !isPaused;
    setIsPaused(nextPaused);
    const action = nextPaused ? "pause" : "turn_on";

    const res = await fetch("/api/sandbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        agentId,
        campaignId,
      }),
    });
    const data = await res.json();
    setSandboxInfo(data);
    setIsPaused(data.status === "paused");
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden transition-colors">
      {/* Agent Header with Power Toggle */}
      <div className="p-3.5 sm:p-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden flex items-center justify-center p-1 relative shadow-xs flex-shrink-0">
            <img src={avatar} alt={agentName} className="w-full h-full object-cover" />
            <span
              className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900 ${
                !isPaused
                  ? "bg-emerald-500 animate-pulse"
                  : "bg-slate-300 dark:bg-slate-600"
              }`}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-slate-800 dark:text-white text-sm truncate">{agentName}</h2>

              {/* Direct Agent PC On/Off Button near Agent Name */}
              <button
                onClick={handlePauseToggle}
                title={isPaused ? "Click to wake Agent PC" : "Click to pause Agent PC"}
                className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold transition-all shadow-2xs cursor-pointer ${
                  isPaused
                    ? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 hover:text-emerald-700 dark:hover:text-emerald-400 border border-slate-200 dark:border-slate-700"
                    : "bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 shadow-emerald-500/10"
                }`}
              >
                <Power className={`w-3 h-3 ${isPaused ? "text-slate-400 dark:text-slate-500" : "text-emerald-600 dark:text-emerald-400 animate-pulse"}`} />
                <span>{isPaused ? "PC Off (Click to On)" : "PC Active (Click to Pause)"}</span>
              </button>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 font-medium truncate max-w-[240px] sm:max-w-xs">{agentRole}</p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200/80 dark:border-slate-700">
          <button
            onClick={() => setActiveTab("chat")}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "chat" ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-xs" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Chat</span>
          </button>
          <button
            onClick={() => setActiveTab("tasks")}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "tasks" ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-xs" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
            }`}
          >
            <ListTodo className="w-3.5 h-3.5" />
            <span>Tasks</span>
            {tasks.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 text-[10px] flex items-center justify-center font-bold">
                {tasks.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("computer")}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "computer"
                ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs ring-1 ring-blue-100 dark:ring-blue-900"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>Computer</span>
            <span className={`w-2 h-2 rounded-full ${isPaused ? "bg-slate-300 dark:bg-slate-600" : "bg-emerald-500 animate-pulse"}`} />
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "settings" ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-xs" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Settings</span>
          </button>
        </div>
      </div>

      {/* State Preserved Banner */}
      {cookieSavedNotification && (
        <div className="bg-emerald-50 dark:bg-emerald-950/60 border-b border-emerald-200 dark:border-emerald-800 px-4 py-2 flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300 font-semibold animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
          <span>Agent PC paused &amp; state preserved! Compute billing stopped. All cookies and tabs remain intact for the next run.</span>
        </div>
      )}

      {/* Tab 1: Chat View */}
      {activeTab === "chat" && (
        <div className="flex-1 flex flex-col min-h-0 bg-slate-50/50 dark:bg-slate-950/50 relative">
          {/* Chat Action Header: Multi-Delete & Clear Chat Options */}
          <div className="px-3 py-1.5 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xs border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-xs z-20">
            {isMultiSelectMode ? (
              <div className="flex items-center justify-between w-full gap-2 animate-in fade-in">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
                  >
                    {selectedMessageIds.length === messages.length && messages.length > 0 ? (
                      <CheckSquare className="w-4 h-4 text-blue-600" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                    <span>{selectedMessageIds.length === messages.length && messages.length > 0 ? "Deselect All" : "Select All"}</span>
                  </button>
                  <span className="text-[11px] text-slate-400 font-mono">
                    ({selectedMessageIds.length} of {messages.length})
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setIsMultiSelectMode(false);
                      setSelectedMessageIds([]);
                    }}
                    className="px-2.5 py-1 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 text-xs font-medium cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteSelectedMessages}
                    disabled={selectedMessageIds.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete ({selectedMessageIds.length})</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between w-full">
                <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                  {messages.length} {messages.length === 1 ? "message" : "messages"}
                </span>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowChatOptionsMenu(!showChatOptionsMenu)}
                    title="Chat options (Delete, Clear)"
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer flex items-center gap-1 text-[11px]"
                  >
                    <MoreVertical className="w-3.5 h-3.5" />
                  </button>

                  {/* Dropdown Menu */}
                  {showChatOptionsMenu && (
                    <div
                      className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl py-1 z-30 animate-in fade-in zoom-in-95 duration-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setIsMultiSelectMode(true);
                          setShowChatOptionsMenu(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <CheckSquare className="w-3.5 h-3.5 text-blue-500" />
                        <span>Select Messages</span>
                      </button>

                      <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

                      <button
                        type="button"
                        onClick={handleClearWholeChat}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-600" />
                        <span>Clear Whole Chat</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div
            className="flex-1 overflow-y-auto p-4 space-y-3.5"
            onClick={() => showChatOptionsMenu && setShowChatOptionsMenu(false)}
          >
            {messages.map((m) => {
              const isUser = m.sender === "user";
              const media = getMessageMedia(m);
              const isSelected = selectedMessageIds.includes(m.id);

              return (
                <div key={m.id} className={`flex items-start gap-2 ${isUser ? "justify-end" : "justify-start"} group relative`}>
                  {/* Multi-select Checkbox */}
                  {isMultiSelectMode && (
                    <button
                      type="button"
                      onClick={() => toggleSelectMessage(m.id)}
                      className="mt-2 text-slate-400 hover:text-blue-600 cursor-pointer flex-shrink-0"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-blue-600" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                      )}
                    </button>
                  )}

                  {!isUser && (
                    <div className="w-7 h-7 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex-shrink-0 flex items-center justify-center p-0.5 shadow-2xs mt-0.5">
                      <img src={avatar} alt={agentName} className="w-full h-full object-cover rounded-lg" />
                    </div>
                  )}

                  {/* Message Bubble Container with Hover Delete */}
                  <div className="relative group/bubble max-w-[85%] sm:max-w-[78%]">
                    <div
                      className={`rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                        isUser
                          ? "bg-blue-600 text-white rounded-br-xs shadow-sm font-medium"
                          : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700/80 rounded-bl-xs shadow-2xs"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{m.text}</p>

                      {/* High-Resolution Media Card (Generated or Attached Image) */}
                      {media.url && (
                        <div className="mt-2.5 rounded-xl overflow-hidden border border-slate-200/90 dark:border-slate-700 bg-slate-900/5 dark:bg-slate-900/40 relative group max-w-sm">
                          <img
                            src={media.url}
                            alt={media.title || "Social media visual"}
                            className="w-full h-auto max-h-72 object-cover rounded-lg cursor-pointer hover:opacity-95 transition-all"
                            onClick={() => setZoomedImage(media.url!)}
                            onError={(e) => {
                              const target = e.currentTarget;
                              if (target.src.includes("model=flux")) {
                                target.src = target.src.replace("model=flux", "model=turbo");
                              }
                            }}
                          />
                          <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 backdrop-blur-xs p-1 rounded-lg">
                            <button
                              type="button"
                              onClick={() => setZoomedImage(media.url!)}
                              title="View Full HD"
                              className="p-1 rounded text-white hover:bg-white/20 cursor-pointer"
                            >
                              <ZoomIn className="w-3.5 h-3.5" />
                            </button>
                            <a
                              href={media.url}
                              target="_blank"
                              rel="noreferrer"
                              download="laxis-asset.png"
                              title="Download Asset"
                              className="p-1 rounded text-white hover:bg-white/20 cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </a>
                          </div>
                          <div className="px-2.5 py-1.5 bg-slate-950/80 backdrop-blur-xs text-[10px] text-white flex items-center justify-between">
                            <span className="flex items-center gap-1.5 truncate font-medium">
                              <Sparkles className="w-3 h-3 text-amber-300 flex-shrink-0" />
                              <span className="truncate">
                                {isUser ? "Attached Image" : media.title || "AI Generated Asset (Flux.1)"}
                              </span>
                            </span>
                            <button
                              type="button"
                              onClick={() => setZoomedImage(media.url!)}
                              className="text-blue-300 hover:text-white text-[9px] underline ml-2 flex-shrink-0 cursor-pointer"
                            >
                              Expand
                            </button>
                          </div>
                        </div>
                      )}

                      <span className={`block text-[9px] mt-1.5 ${isUser ? "text-blue-200 text-right" : "text-slate-400 dark:text-slate-500"}`}>
                        {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>

                    {/* Single message instant delete icon on hover */}
                    {!isMultiSelectMode && (
                      <button
                        type="button"
                        onClick={(e) => handleDeleteSingleMessage(m.id, e)}
                        title="Delete this message"
                        className={`absolute top-1 p-1 rounded-md bg-white dark:bg-slate-800 text-slate-400 hover:text-red-600 dark:hover:text-red-400 shadow-xs border border-slate-200 dark:border-slate-700 opacity-0 group-hover/bubble:opacity-100 transition-opacity cursor-pointer ${
                          isUser ? "-left-6" : "-right-6"
                        }`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {isLoading && (
              <div className="flex gap-2.5 items-center text-slate-400 dark:text-slate-500 text-xs italic pl-9">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
                <span>{agentName} is responding...</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Attached Image Preview Bar */}
          {attachedImage && (
            <div className="px-3.5 py-2 bg-blue-50/70 dark:bg-blue-950/40 border-t border-blue-200/80 dark:border-blue-900/50 flex items-center justify-between gap-3 animate-in fade-in">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-blue-300 dark:border-blue-800 shadow-2xs flex-shrink-0">
                  <img src={attachedImage} alt="Attachment" className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-blue-950 dark:text-blue-200 truncate">Visual Attached</p>
                  <p className="text-[10px] text-blue-700 dark:text-blue-300 truncate">
                    {agentName} will incorporate this visual or generate campaigns from it
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAttachedImage(null)}
                className="p-1 rounded-full text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900 cursor-pointer"
                title="Remove attachment"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Direct URL Attachment Input Popover */}
          {showUrlPrompt && (
            <div className="px-3.5 py-2 bg-slate-100 dark:bg-slate-850 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 animate-in fade-in">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Paste direct image URL (https://...)..."
                className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => {
                  if (urlInput.trim()) {
                    setAttachedImage(urlInput.trim());
                    setUrlInput("");
                    setShowUrlPrompt(false);
                  }
                }}
                disabled={!urlInput.trim()}
                className="px-3 py-1.5 bg-blue-600 disabled:opacity-40 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 cursor-pointer"
              >
                Attach
              </button>
              <button
                type="button"
                onClick={() => setShowUrlPrompt(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Hidden File Picker */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept="image/*"
            className="hidden"
          />

          {/* Quick Prompt Pill: Instant Visual Generation */}
          <div className="px-3 py-1.5 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 overflow-x-auto text-[11px]">
            <span className="text-slate-400 dark:text-slate-500 font-medium flex items-center gap-1 flex-shrink-0">
              <Sparkles className="w-3 h-3 text-amber-500" /> Quick action:
            </span>
            <button
              type="button"
              onClick={() => {
                const prompt =
                  agentId === "fb_laxdollar"
                    ? "Generate an ultra-realistic 3D trading candlestick chart visual with Deriv boom and crash setup for laxdollar.site"
                    : agentId === "fb_jotrainer"
                    ? "Generate a clean high-tech photo of a remote AI data annotator laptop workspace"
                    : agentId === "fb_contentor"
                    ? "Generate a hilarious relatable comedy meme scene with African street humor"
                    : agentId === "ig_real"
                    ? "Generate a dramatic moody true story confession visual with cinematic lighting"
                    : agentId === "ig_shader"
                    ? "Generate a glossy paparazzi red carpet celebrity scoop visual"
                    : "Generate a high-converting promotional visual for our social media campaign";
                setInputText(prompt);
              }}
              className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/60 hover:text-blue-700 dark:hover:text-blue-400 text-slate-600 dark:text-slate-300 rounded-lg text-[11px] font-medium transition-all flex-shrink-0 cursor-pointer"
            >
              🎨 Suggest Creative Visual Prompt
            </button>
          </div>

          {/* Chat Form */}
          <form onSubmit={handleSendMessage} className="p-3 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Upload / Send Image to Agent"
              className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 flex items-center justify-center transition-all cursor-pointer flex-shrink-0"
            >
              <ImageIcon className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setShowUrlPrompt(!showUrlPrompt)}
              title="Attach Image from Web URL"
              className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 flex items-center justify-center transition-all cursor-pointer flex-shrink-0"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={
                agentId === "master"
                  ? "Direct Master Agent, ask for campaign plans, or send images..."
                  : `Send instructions or generate images with ${agentName}...`
              }
              className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
            <button
              type="submit"
              disabled={isLoading || (!inputText.trim() && !attachedImage)}
              className="w-9 h-9 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white flex items-center justify-center shadow-sm transition-all cursor-pointer flex-shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* Tab 2: Tasks View */}
      {activeTab === "tasks" && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50 dark:bg-slate-950/50">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Assigned Tasks ({tasks.length})</span>
            <span className="text-[11px] text-slate-400 dark:text-slate-500">Master Agent Directed</span>
          </div>
          {tasks.length === 0 ? (
            <div className="py-12 text-center text-slate-400 dark:text-slate-500 text-xs">
              <Clock className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
              No pending tasks. Master Agent assigns tasks during autonomous runs.
            </div>
          ) : (
            tasks.map((task) => (
              <div key={task.id} className="p-3.5 bg-white dark:bg-slate-800/90 rounded-xl border border-slate-200/90 dark:border-slate-700 shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-slate-800 dark:text-white">{task.title}</span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${
                      task.status === "completed"
                        ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                        : task.status === "in_progress"
                        ? "bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800"
                        : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    {task.status}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                  {task.instructions}
                </p>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 3: Computer View with E2B Controls */}
      {activeTab === "computer" && (
        <div className="flex-1 flex flex-col p-4 bg-slate-50/50 dark:bg-slate-950/50 overflow-y-auto">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 pb-3 border-b border-slate-200/80 dark:border-slate-800">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`w-2.5 h-2.5 rounded-full ${isPaused ? "bg-amber-500" : "bg-emerald-500 animate-pulse"} flex-shrink-0`} />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-slate-800 dark:text-white">
                    {isPaused ? "AGENT PC Paused ($0 Compute)" : "AGENT PC Active (Running)"}
                  </span>
                  <span className="text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" /> State Preserved
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">
                  {isPaused
                    ? "Agent PC paused. Turns on automatically for tasks or when you click Turn On."
                    : sandboxInfo?.sandboxId ? `Active Workstation: ${sandboxInfo.sandboxId} (US Cloud)` : "Running"}
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={handlePauseToggle}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer ${
                  isPaused
                    ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20"
                    : "bg-amber-600 hover:bg-amber-500 text-white shadow-amber-500/20"
                }`}
              >
                {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                <span>{isPaused ? "Turn On Pc" : "Pause Pc"}</span>
              </button>

              <button
                onClick={handleTakeOverToggle}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition-all cursor-pointer"
              >
                <Laptop className="w-3.5 h-3.5" />
                <span>Take Over &amp; Control</span>
              </button>
            </div>
          </div>

          {/* Desktop Viewport */}
          <div className="flex-1 min-h-[300px] max-h-[460px] bg-slate-950 rounded-2xl border-2 border-slate-200 dark:border-slate-800 overflow-hidden relative shadow-md group">
            {sandboxInfo?.previewImage ? (
              <img
                src={sandboxInfo.previewImage}
                alt="Cloud Desktop Preview"
                className="w-full h-full object-contain bg-slate-950 select-none"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-white/60 text-xs">
                <Monitor className="w-8 h-8 mb-2" />
                <span>Agent pc paused, Click &quot;Turn On&quot; to wake it</span>
              </div>
            )}

            {/* Bottom Overlay Banner */}
            <div className="absolute bottom-3 left-3 right-3 bg-slate-900/90 backdrop-blur-md rounded-xl p-3 flex items-center justify-between text-white border border-white/10 shadow-lg">
              <div className="flex items-center gap-2 text-xs">
                <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span className="text-[11px] truncate">
                  Agent PC Persistence: Keeps accounts logged in. Stays paused until tasks run or you turn on.
                </span>
              </div>
              <button
                onClick={handleTakeOverToggle}
                className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer flex-shrink-0"
              >
                <Maximize2 className="w-3 h-3" />
                <span>Open Interactive PC</span>
              </button>
            </div>
          </div>

          <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
            This agent has its own dedicated <strong>AGENT PC</strong> with independent accounts and browser sessions. It remains paused until scheduled publishing runs, ensuring zero wasted compute.
          </p>
        </div>
      )}

      {/* Tab 4: Settings View */}
      {activeTab === "settings" && (
        <div className="flex-1 p-5 space-y-4 bg-slate-50/50 dark:bg-slate-950/50 overflow-y-auto">
          <div className="space-y-1">
            <h3 className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider">Agent Intelligence &amp; Niche</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Autonomous configuration for {agentName}.</p>
          </div>
          <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">Target Niche</label>
              <input
                type="text"
                readOnly
                value={
                  agentId === "fb_laxdollar"
                    ? "Deriv Trading, Synthetic Indices, Forex & Money Memes (laxdollar.site)"
                    : agentId === "fb_jotrainer"
                    ? "Microwork, AI Data Annotation, Remotasks & Remote Jobs"
                    : agentId === "fb_contentor"
                    ? "Viral Sheng Comedy, Relatable Memes & Street Humor"
                    : agentId === "ig_real"
                    ? "Dramatic True Stories, Confessions & Moral Dilemmas"
                    : agentId === "ig_shader"
                    ? "Urban Pop Culture Gossip, Celebrity Scoops & AI Drama"
                    : "Autonomous Multi-Agent Orchestration"
                }
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs text-slate-700 dark:text-slate-200"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">Daily Post Quota</label>
              <div className="p-2.5 bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900/60 rounded-lg text-xs text-blue-800 dark:text-blue-300 font-semibold flex items-center justify-between">
                <span>Dynamic Human Schedule (Master Agent Decided)</span>
                <span className="bg-blue-600 text-white px-2 py-0.5 rounded-full text-[10px]">3 - 8 Posts/Day</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Interactive Take Over Modal */}
      {isFullscreenModal && (
        <div className="fixed inset-0 z-[99999] bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-6xl h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Top Navigation */}
            <div className="p-2.5 sm:p-3 bg-slate-800 border-b border-slate-700 flex flex-wrap items-center justify-between gap-2 sm:gap-3 text-white">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-bold text-xs tracking-wide">
                  Real AGENT PC Desktop: {agentName}
                </span>
                <span className="hidden sm:inline text-[10px] bg-blue-900/60 border border-blue-700 text-blue-200 px-2 py-0.5 rounded-full">
                  US Cloud IP (Agent PC)
                </span>
              </div>

              {/* URL Navigator */}
              <div className="flex items-center gap-1.5 bg-slate-900 px-2.5 py-1.5 rounded-xl border border-slate-700 text-xs flex-1 max-w-sm sm:max-w-md">
                <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input
                  type="text"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleNavigate(customUrl)}
                  placeholder="https://facebook.com"
                  className="bg-transparent border-none text-white focus:outline-none text-xs flex-1 min-w-[100px]"
                />
                <button
                  onClick={() => handleNavigate(customUrl)}
                  disabled={isNavigating}
                  className="px-2 py-0.5 bg-blue-600 hover:bg-blue-500 rounded text-[10px] font-bold text-white transition-all cursor-pointer shrink-0"
                >
                  {isNavigating ? "Opening..." : "Go"}
                </button>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                {/* Paste from PC Clipboard Button */}
                <button
                  onClick={handlePasteFromDeviceClipboard}
                  disabled={isPasting}
                  title="Paste text from your PC into Agent PC (or press Ctrl+V anywhere)"
                  className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white shadow-sm transition-all cursor-pointer"
                >
                  <Clipboard className="w-3.5 h-3.5 text-purple-200" />
                  <span className="text-[11px]">{isPasting ? "Pasting..." : "Paste from PC"}</span>
                </button>

                {/* Instant Reconnect Button */}
                <button
                  onClick={handleWakeAndReconnect}
                  title="Reconnect or wake Agent PC"
                  className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold transition-all cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-[11px]">Reconnect</span>
                </button>

                {/* Virtual Mobile Keyboard Trigger Button */}
                <button
                  onClick={() => {
                    const next = !showKeyboardHelper;
                    setShowKeyboardHelper(next);
                    if (next) {
                      setTimeout(() => mobileInputRef.current?.focus(), 150);
                    }
                  }}
                  title="Call Mobile Keyboard (Type directly into Agent PC)"
                  className={`flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    showKeyboardHelper
                      ? "bg-blue-600 text-white shadow-sm ring-1 ring-blue-400"
                      : "bg-slate-700 hover:bg-slate-600 text-slate-200"
                  }`}
                >
                  <Keyboard className="w-3.5 h-3.5 text-blue-300" />
                  <span className="text-[11px]">Keyboard</span>
                </button>

                {sandboxInfo?.streamUrl && (
                  <button
                    onClick={() => window.open(sandboxInfo.streamUrl, "_blank")}
                    title="Open in dedicated clean window (bypasses extension popups)"
                    className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold transition-all cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Pop-out</span>
                  </button>
                )}

                <button
                  onClick={handleSaveAndHibernate}
                  title="Pause &amp; Save State"
                  className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Pause &amp; Save State</span>
                  <span className="sm:hidden">Save</span>
                </button>

                <button
                  onClick={() => setIsFullscreenModal(false)}
                  className="w-8 h-8 rounded-xl bg-slate-700 hover:bg-slate-600 text-white flex items-center justify-center transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Mobile Keyboard Typing Bar */}
            {showKeyboardHelper && (
              <div className="bg-slate-900 border-b border-blue-500/40 p-2 sm:p-2.5 flex flex-wrap items-center gap-2 animate-in fade-in slide-in-from-top-1">
                <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                  <input
                    ref={mobileInputRef}
                    type="text"
                    value={keyboardInputText}
                    onChange={(e) => setKeyboardInputText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleSendKeyboardText();
                      }
                    }}
                    placeholder="Type here to send directly to Agent PC..."
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                    autoFocus
                  />
                  <button
                    onClick={handleSendKeyboardText}
                    disabled={isSendingKey || !keyboardInputText}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <CornerDownLeft className="w-3.5 h-3.5" />
                    <span>Type</span>
                  </button>
                </div>

                {/* Quick Hardware Keys */}
                <div className="flex items-center gap-1 overflow-x-auto py-0.5">
                  <button
                    onClick={() => handleSendSpecialKey("Return")}
                    disabled={isSendingKey}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] rounded font-medium cursor-pointer"
                    title="Enter / Return"
                  >
                    Enter ↵
                  </button>
                  <button
                    onClick={() => handleSendSpecialKey("BackSpace")}
                    disabled={isSendingKey}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] rounded font-medium cursor-pointer"
                    title="Backspace"
                  >
                    ⌫ Back
                  </button>
                  <button
                    onClick={() => handleSendSpecialKey("Tab")}
                    disabled={isSendingKey}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] rounded font-medium cursor-pointer"
                    title="Tab"
                  >
                    Tab ⇥
                  </button>
                  <button
                    onClick={() => handleSendSpecialKey("space")}
                    disabled={isSendingKey}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] rounded font-medium cursor-pointer"
                    title="Space"
                  >
                    Space
                  </button>
                  <button
                    onClick={() => handleSendSpecialKey("Escape")}
                    disabled={isSendingKey}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] rounded font-medium cursor-pointer"
                    title="Escape"
                  >
                    Esc
                  </button>
                  <button
                    onClick={() => setShowKeyboardHelper(false)}
                    className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded cursor-pointer"
                    title="Close Keyboard"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Quick Launch Niche Shortcuts (Agent Tailored & Editable) */}
            <div className="bg-slate-950 px-3 sm:px-4 py-1.5 border-b border-slate-800 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                  <button
                    onClick={() => setIsShortcutsCollapsed(!isShortcutsCollapsed)}
                    className="flex items-center gap-1 hover:text-slate-200 cursor-pointer font-semibold"
                  >
                    {isShortcutsCollapsed ? (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                    ) : (
                      <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                    )}
                    <span>{agentName} Niche Shortcuts ({shortcuts.length})</span>
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setShowAddShortcutModal(true)}
                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-medium flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add</span>
                  </button>
                  <button
                    onClick={() => setIsEditingShortcuts(!isEditingShortcuts)}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium cursor-pointer ${
                      isEditingShortcuts
                        ? "bg-amber-600 text-white"
                        : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                    }`}
                  >
                    {isEditingShortcuts ? "Done" : "Edit"}
                  </button>
                  {shortcuts.length > 0 && (
                    <button
                      onClick={handleClearAllShortcuts}
                      className="px-2 py-0.5 bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 rounded text-[10px] font-medium cursor-pointer"
                      title="Clear All Shortcuts"
                    >
                      Clear All
                    </button>
                  )}
                  {shortcuts.length === 0 && (
                    <button
                      onClick={handleResetDefaultShortcuts}
                      className="px-2 py-0.5 bg-blue-950 border border-blue-800 hover:bg-blue-900 text-blue-300 rounded text-[10px] font-medium cursor-pointer"
                    >
                      Restore Niche
                    </button>
                  )}
                </div>
              </div>

              {/* Add Shortcut Form */}
              {showAddShortcutModal && (
                <div className="mt-2 p-2 bg-slate-900 rounded-xl border border-slate-700 flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    placeholder="Label (e.g. TradingView)"
                    value={newShortcutLabel}
                    onChange={(e) => setNewShortcutLabel(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-white text-xs flex-1 min-w-[120px]"
                  />
                  <input
                    type="text"
                    placeholder="URL (e.g. tradingview.com)"
                    value={newShortcutUrl}
                    onChange={(e) => setNewShortcutUrl(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-white text-xs flex-1 min-w-[150px]"
                  />
                  <button
                    onClick={handleAddShortcut}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold cursor-pointer"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setShowAddShortcutModal(false)}
                    className="px-2 py-1 bg-slate-800 text-slate-300 rounded-lg text-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Shortcuts List */}
              {!isShortcutsCollapsed && shortcuts.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5 pb-0.5">
                  {shortcuts.map((sc, idx) => (
                    <div
                      key={idx}
                      className="inline-flex items-center gap-1 bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/80 rounded-lg px-2.5 py-1 text-[11px] transition-all"
                    >
                      <button
                        onClick={() => handleNavigate(sc.url)}
                        className="hover:text-blue-400 font-medium cursor-pointer"
                      >
                        {sc.label}
                      </button>
                      {isEditingShortcuts && (
                        <button
                          onClick={() => handleDeleteShortcut(idx)}
                          className="text-slate-400 hover:text-rose-400 cursor-pointer ml-1"
                          title="Delete shortcut"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Real Interactive noVNC Cloud Stream */}
            <div
              className="flex-1 bg-slate-950 relative overflow-hidden flex items-center justify-center"
              onMouseMove={() => (lastActiveTimeRef.current = Date.now())}
              onMouseEnter={() => (lastActiveTimeRef.current = Date.now())}
              onClick={() => (lastActiveTimeRef.current = Date.now())}
            >
              {/* Host PC Paste Toast Notification */}
              {pasteSuccessToast && (
                <div className="absolute top-4 right-4 z-50 bg-emerald-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl shadow-xl flex items-center gap-1.5 animate-in fade-in slide-in-from-top-1">
                  <Check className="w-3.5 h-3.5" />
                  <span>{pasteSuccessToast}</span>
                </div>
              )}

              {/* 10-Minute Inactivity Idle Overlay */}
              {isIdlePaused ? (
                <div className="absolute inset-0 z-30 bg-slate-950/92 backdrop-blur-sm flex flex-col items-center justify-center text-white text-center p-6 animate-in fade-in">
                  <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-3">
                    <Power className="w-7 h-7 text-amber-400" />
                  </div>
                  <h3 className="text-sm font-bold text-white mb-1">Agent PC Paused (10 Min Inactivity)</h3>
                  <p className="text-xs text-slate-400 max-w-sm mb-4">
                    Desktop automatically paused to protect compute credits ($0 compute). Your opened tabs, Chrome logins, and state are preserved.
                  </p>
                  <button
                    onClick={handleWakeAndReconnect}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/30 flex items-center gap-2 cursor-pointer transition-all hover:scale-105"
                  >
                    <Play className="w-3.5 h-3.5 fill-white" />
                    <span>Wake &amp; Connect Agent PC</span>
                  </button>
                </div>
              ) : sandboxInfo?.streamUrl ? (
                <iframe
                  key={`${sandboxInfo.streamUrl}_${streamKey}`}
                  src={sandboxInfo.streamUrl}
                  className="w-full h-full border-none"
                  title="Interactive AGENT PC Desktop"
                  allow="clipboard-read; clipboard-write"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-white/70 text-xs p-6 text-center">
                  <Monitor className="w-10 h-10 mb-3 animate-spin text-blue-400" />
                  <p className="font-bold text-sm text-white">Launching Interactive Cloud Stream...</p>
                  <p className="text-slate-400 text-xs mt-1">Starting display server on Agent PC.</p>
                  <button
                    onClick={handleWakeAndReconnect}
                    className="mt-4 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-bold text-white cursor-pointer shadow-md"
                  >
                    Connect Stream Now
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Full-Screen HD Asset Zoom Modal */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in"
          onClick={() => setZoomedImage(null)}
        >
          <div
            className="relative max-w-4xl w-full flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between pb-3 text-white">
              <span className="text-xs font-semibold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                High-Definition Visual Preview (Pollinations Flux.1)
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={zoomedImage}
                  target="_blank"
                  rel="noreferrer"
                  download="laxis-asset.png"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-medium cursor-pointer transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download HD</span>
                </a>
                <button
                  onClick={() => setZoomedImage(null)}
                  className="p-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-white cursor-pointer transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="rounded-2xl overflow-hidden border border-white/20 bg-black/40 shadow-2xl max-h-[82vh] flex items-center justify-center">
              <img
                src={zoomedImage}
                alt="Enlarged visual"
                className="max-h-[82vh] max-w-full object-contain"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (target.src.includes("model=flux")) {
                    target.src = target.src.replace("model=flux", "model=turbo");
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
