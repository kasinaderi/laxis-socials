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
} from "lucide-react";

interface AgentTabsProps {
  agentId: string;
  agentName: string;
  agentRole: string;
  agentStatus: "idle" | "running" | "done" | "paused";
  avatar: string;
  campaignId?: string;
}

export function AgentTabs({
  agentId,
  agentName,
  agentRole,
  agentStatus = "idle",
  avatar,
  campaignId = "default_campaign",
}: AgentTabsProps) {
  const [activeTab, setActiveTab] = useState<"chat" | "tasks" | "computer" | "settings">("computer");
  const [messages, setMessages] = useState<Array<{ id: string; sender: string; text: string; createdAt: string }>>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Computer Tab & E2B Cloud Desktop state
  const [isTakeOver, setIsTakeOver] = useState(false);
  const [isFullscreenModal, setIsFullscreenModal] = useState(false);
  const [isPaused, setIsPaused] = useState(true); // Default to paused to protect credits!
  const [sandboxInfo, setSandboxInfo] = useState<any>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [customUrl, setCustomUrl] = useState("https://facebook.com");
  const [cookieSavedNotification, setCookieSavedNotification] = useState(false);

  // Tasks Tab state
  const [tasks, setTasks] = useState<any[]>([]);

  const chatEndRef = useRef<HTMLDivElement>(null);

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
    if (!inputText.trim() || isLoading) return;

    const userText = inputText.trim();
    setInputText("");
    setIsLoading(true);

    setMessages((prev) => [
      ...prev,
      { id: `temp_${Date.now()}`, sender: "user", text: userText, createdAt: new Date().toISOString() },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          campaignId,
          text: userText,
        }),
      });
      const data = await res.json();
      if (data.reply) {
        setMessages((prev) => [
          ...prev,
          { id: `reply_${Date.now()}`, sender: agentId, text: data.reply, createdAt: new Date().toISOString() },
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
    <div className="flex flex-col h-full bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
      {/* Agent Header with Power Toggle */}
      <div className="p-3.5 sm:p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center p-1 relative shadow-xs flex-shrink-0">
            <img src={avatar} alt={agentName} className="w-full h-full object-cover" />
            <span
              className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
                !isPaused
                  ? "bg-emerald-500 animate-pulse"
                  : "bg-slate-300"
              }`}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-slate-800 text-sm truncate">{agentName}</h2>

              {/* Direct Sandbox On/Off Button near Agent Name as requested */}
              <button
                onClick={handlePauseToggle}
                title={isPaused ? "Click to wake E2B MicroVM" : "Click to pause and stop billing"}
                className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold transition-all shadow-2xs cursor-pointer ${
                  isPaused
                    ? "bg-slate-100 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 border border-slate-200"
                    : "bg-emerald-50 text-emerald-700 border border-emerald-300 shadow-emerald-500/10"
                }`}
              >
                <Power className={`w-3 h-3 ${isPaused ? "text-slate-400" : "text-emerald-600 animate-pulse"}`} />
                <span>{isPaused ? "Sandbox Off (Click to On)" : "Sandbox Running (Click to Pause)"}</span>
              </button>
            </div>
            <p className="text-xs text-slate-400 font-medium truncate max-w-[240px] sm:max-w-xs">{agentRole}</p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200/80">
          <button
            onClick={() => setActiveTab("chat")}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "chat" ? "bg-white text-slate-800 shadow-xs" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Chat</span>
          </button>
          <button
            onClick={() => setActiveTab("tasks")}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "tasks" ? "bg-white text-slate-800 shadow-xs" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <ListTodo className="w-3.5 h-3.5" />
            <span>Tasks</span>
            {tasks.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-700 text-[10px] flex items-center justify-center font-bold">
                {tasks.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("computer")}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "computer"
                ? "bg-white text-blue-600 shadow-xs ring-1 ring-blue-100"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>Computer</span>
            <span className={`w-2 h-2 rounded-full ${isPaused ? "bg-slate-300" : "bg-emerald-500 animate-pulse"}`} />
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "settings" ? "bg-white text-slate-800 shadow-xs" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Settings</span>
          </button>
        </div>
      </div>

      {/* State Preserved Banner */}
      {cookieSavedNotification && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2 flex items-center gap-2 text-xs text-emerald-800 font-semibold animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>E2B VM paused &amp; state preserved! CPU billing stopped. All cookies and tabs remain intact for the next run.</span>
        </div>
      )}

      {/* Tab 1: Chat View */}
      {activeTab === "chat" && (
        <div className="flex-1 flex flex-col min-h-0 bg-slate-50/50">
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
            {messages.map((m) => {
              const isUser = m.sender === "user";
              return (
                <div key={m.id} className={`flex gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}>
                  {!isUser && (
                    <div className="w-7 h-7 rounded-xl bg-white border border-slate-200 flex-shrink-0 flex items-center justify-center p-0.5 shadow-2xs">
                      <img src={avatar} alt={agentName} className="w-full h-full object-cover rounded-lg" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                      isUser
                        ? "bg-blue-600 text-white rounded-br-xs shadow-sm font-medium"
                        : "bg-white text-slate-700 border border-slate-200/80 rounded-bl-xs shadow-2xs"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.text}</p>
                    <span className={`block text-[9px] mt-1 ${isUser ? "text-blue-200 text-right" : "text-slate-400"}`}>
                      {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
              );
            })}
            {isLoading && (
              <div className="flex gap-2.5 items-center text-slate-400 text-xs italic pl-9">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
                <span>{agentName} is thinking &amp; executing...</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={handleSendMessage} className="p-3 bg-white border-t border-slate-100 flex items-center gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={`Send instructions to ${agentName}...`}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
            <button
              type="submit"
              disabled={isLoading || !inputText.trim()}
              className="w-9 h-9 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white flex items-center justify-center shadow-sm transition-all cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* Tab 2: Tasks View */}
      {activeTab === "tasks" && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <span className="text-xs font-bold text-slate-700">Assigned Tasks ({tasks.length})</span>
            <span className="text-[11px] text-slate-400">Master Agent Directed</span>
          </div>
          {tasks.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              <Clock className="w-8 h-8 mx-auto text-slate-300 mb-2" />
              No pending tasks. Master Agent assigns tasks during autonomous runs.
            </div>
          ) : (
            tasks.map((task) => (
              <div key={task.id} className="p-3.5 bg-white rounded-xl border border-slate-200/90 shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-slate-800">{task.title}</span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${
                      task.status === "completed"
                        ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                        : task.status === "in_progress"
                        ? "bg-blue-50 text-blue-600 border border-blue-200"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {task.status}
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  {task.instructions}
                </p>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 3: Computer View with E2B Controls */}
      {activeTab === "computer" && (
        <div className="flex-1 flex flex-col p-4 bg-slate-50/50 overflow-y-auto">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 pb-3 border-b border-slate-200/80">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`w-2.5 h-2.5 rounded-full ${isPaused ? "bg-amber-500" : "bg-emerald-500 animate-pulse"} flex-shrink-0`} />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-slate-800">
                    {isPaused ? "E2B Sandbox Paused ($0 Compute)" : "E2B Sandbox Active (Running)"}
                  </span>
                  <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" /> State Preserved
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium truncate">
                  {isPaused
                    ? "MicroVM paused. Turns on automatically for tasks or when you click Turn On."
                    : sandboxInfo?.sandboxId ? `Active MicroVM: ${sandboxInfo.sandboxId} (US Cloud)` : "Running"}
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
                <span>{isPaused ? "Turn On Sandbox" : "Pause & Save"}</span>
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
          <div className="flex-1 min-h-[300px] max-h-[460px] bg-slate-950 rounded-2xl border-2 border-slate-200 overflow-hidden relative shadow-md group">
            {sandboxInfo?.previewImage ? (
              <img
                src={sandboxInfo.previewImage}
                alt="Cloud Desktop Preview"
                className="w-full h-full object-contain bg-slate-950 select-none"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-white/60 text-xs">
                <Monitor className="w-8 h-8 mb-2" />
                <span>Sandbox paused to protect your $100 credit. Click &quot;Turn On&quot; to wake it.</span>
              </div>
            )}

            {/* Bottom Overlay Banner */}
            <div className="absolute bottom-3 left-3 right-3 bg-slate-900/90 backdrop-blur-md rounded-xl p-3 flex items-center justify-between text-white border border-white/10 shadow-lg">
              <div className="flex items-center gap-2 text-xs">
                <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span className="text-[11px] truncate">
                  E2B Persistence: Sandboxes stay paused until tasks run or you turn them on.
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

          <p className="mt-3 text-[11px] text-slate-500 leading-relaxed font-medium">
            This agent has its own dedicated <strong>E2B cloud desktop</strong> with independent cookies. It remains paused until scheduled publishing runs, ensuring zero wasted credits.
          </p>
        </div>
      )}

      {/* Tab 4: Settings View */}
      {activeTab === "settings" && (
        <div className="flex-1 p-5 space-y-4 bg-slate-50/50 overflow-y-auto">
          <div className="space-y-1">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Agent Intelligence &amp; Niche</h3>
            <p className="text-xs text-slate-500">Autonomous configuration for {agentName}.</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Target Niche</label>
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
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-700"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Daily Post Quota</label>
              <div className="p-2.5 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-800 font-semibold flex items-center justify-between">
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
            <div className="p-3 bg-slate-800 border-b border-slate-700 flex flex-wrap items-center justify-between gap-3 text-white">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-bold text-xs tracking-wide">
                  Real E2B Cloud Desktop: {agentName}
                </span>
                <span className="text-[10px] bg-blue-900/60 border border-blue-700 text-blue-200 px-2 py-0.5 rounded-full">
                  US Cloud IP (E2B VM)
                </span>
              </div>

              {/* URL Navigator */}
              <div className="flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-700 text-xs flex-1 max-w-md">
                <Globe className="w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleNavigate(customUrl)}
                  placeholder="https://facebook.com"
                  className="bg-transparent border-none text-white focus:outline-none text-xs flex-1"
                />
                <button
                  onClick={() => handleNavigate(customUrl)}
                  disabled={isNavigating}
                  className="px-2 py-0.5 bg-blue-600 hover:bg-blue-500 rounded text-[10px] font-bold text-white transition-all cursor-pointer"
                >
                  {isNavigating ? "Opening..." : "Go"}
                </button>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                {sandboxInfo?.streamUrl && (
                  <button
                    onClick={() => window.open(sandboxInfo.streamUrl, "_blank")}
                    title="Open in dedicated clean window (bypasses MetaMask extension popups)"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold transition-all cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Pop-out Window</span>
                  </button>
                )}

                <button
                  onClick={handleSaveAndHibernate}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Pause &amp; Save State</span>
                </button>

                <button
                  onClick={() => setIsFullscreenModal(false)}
                  className="w-8 h-8 rounded-xl bg-slate-700 hover:bg-slate-600 text-white flex items-center justify-center transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Quick Launch Shortcuts into Cloud Browser */}
            <div className="bg-slate-950 px-4 py-2 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-400 text-[11px] font-semibold">Open in Cloud Browser:</span>
                <button
                  onClick={() => handleNavigate("https://facebook.com")}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[11px] font-medium"
                >
                  Facebook Login
                </button>
                <button
                  onClick={() => handleNavigate("https://facebook.com/groups")}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[11px] font-medium"
                >
                  Facebook Groups
                </button>
                <button
                  onClick={() => handleNavigate("https://instagram.com")}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[11px] font-medium"
                >
                  Instagram Login
                </button>
                <button
                  onClick={() => handleNavigate("https://laxdollar.site")}
                  className="px-2.5 py-1 bg-emerald-950 text-emerald-300 border border-emerald-800 hover:bg-emerald-900 rounded-lg text-[11px] font-medium"
                >
                  laxdollar.site
                </button>
                <button
                  onClick={() => handleNavigate("https://whoer.net")}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-lg text-[11px] font-medium"
                >
                  Verify Cloud IP (whoer.net)
                </button>
              </div>

              {/* Notice regarding browser extensions */}
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 bg-slate-900 px-2.5 py-1 rounded-md border border-slate-800">
                <AlertTriangle className="w-3 h-3 text-amber-400" />
                <span>Tip: If your browser extension shows an alert, click inside desktop or click &quot;Pop-out Window&quot;.</span>
              </div>
            </div>

            {/* Real Interactive noVNC Cloud Stream */}
            <div className="flex-1 bg-slate-950 relative overflow-hidden flex items-center justify-center">
              {sandboxInfo?.streamUrl ? (
                <iframe
                  src={sandboxInfo.streamUrl}
                  className="w-full h-full border-none"
                  title="Interactive E2B Cloud Desktop"
                  allow="clipboard-read; clipboard-write"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-white/70 text-xs p-6 text-center">
                  <Monitor className="w-10 h-10 mb-3 animate-spin text-blue-400" />
                  <p className="font-bold text-sm text-white">Launching Interactive Cloud Stream...</p>
                  <p className="text-slate-400 text-xs mt-1">Starting noVNC display server on E2B cloud microVM.</p>
                  <button
                    onClick={fetchSandbox}
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
    </div>
  );
}
