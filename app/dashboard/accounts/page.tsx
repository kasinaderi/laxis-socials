"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import {
  Users2,
  Plus,
  Radio,
  ExternalLink,
  Laptop,
  CheckCircle2,
  ShieldCheck,
  Trash2,
} from "lucide-react";

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [platform, setPlatform] = useState("facebook");
  const [accountName, setAccountName] = useState("");
  const [isGroup, setIsGroup] = useState(true);
  const [groupUrl, setGroupUrl] = useState("");

  const fetchAccounts = async () => {
    try {
      const res = await fetch("/api/accounts");
      const data = await res.json();
      if (data.accounts) setAccounts(data.accounts);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountName.trim()) return;

    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          accountName,
          profileUrl: groupUrl || `https://${platform}.com`,
          isGroup,
          groupName: accountName,
        }),
      });

      if (res.ok) {
        fetchAccounts();
        setIsAddModalOpen(false);
        setAccountName("");
        setGroupUrl("");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteAccount = async (id: string) => {
    try {
      await fetch("/api/accounts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      fetchAccounts();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex h-screen bg-slate-100/60 overflow-hidden font-sans">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header
          title="Social Accounts & Groups"
          subtitle="Manage authorized channels, Facebook Groups, and Reddit subreddits automated by Locoagent"
          onCreatePostClick={() => setIsAddModalOpen(true)}
        />

        <main className="flex-1 p-6 overflow-y-auto">
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-800 p-6 rounded-2xl text-white shadow-lg shadow-blue-500/10 mb-6 flex items-center justify-between">
            <div className="max-w-xl">
              <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full mb-2 inline-block">
                Autonomous Browser Automation (Locoagent)
              </span>
              <h2 className="text-lg font-bold">100% Free Group & Profile Posting</h2>
              <p className="text-xs text-blue-100 mt-1 leading-relaxed">
                Unlike traditional APIs that block group automation or charge high monthly fees, Locoagent uses authentic Chrome CDP sessions inside isolated E2B sandboxes. Log in once via the virtual desktop, and your agents post autonomously.
              </p>
            </div>

            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white text-blue-700 hover:bg-blue-50 font-bold text-xs shadow-md transition-all cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Connect Group / Account</span>
            </button>
          </div>

          {/* Accounts Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {accounts.map((acc) => (
              <div
                key={acc.id}
                className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex flex-col justify-between space-y-4 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-lg">
                      {acc.platform === "facebook"
                        ? "👥"
                        : acc.platform === "instagram"
                        ? "📸"
                        : acc.platform === "reddit"
                        ? "🤖"
                        : acc.platform === "x"
                        ? "🐦"
                        : "💼"}
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-800 leading-snug line-clamp-1">{acc.accountName}</h4>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] font-semibold text-slate-400 capitalize">{acc.platform}</span>
                        {acc.isGroup === 1 && (
                          <span className="text-[9px] font-bold bg-blue-50 text-blue-600 px-1.5 py-0.2 rounded border border-blue-100">
                            Group / Community
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                    <Radio className="w-2.5 h-2.5 animate-pulse" />
                    Active
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-[11px] text-slate-500 space-y-1">
                  <div className="flex justify-between">
                    <span>CDP Fingerprint:</span>
                    <span className="font-semibold text-slate-700">Protected</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Session Status:</span>
                    <span className="font-semibold text-emerald-600">Cookie Cached</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <a
                    href={acc.profileUrl || "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1 font-semibold"
                  >
                    <span>Inspect Target</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>

                  <button
                    onClick={() => handleDeleteAccount(acc.id)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>

      {/* Add Account Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="font-bold text-sm text-slate-800">Connect Social Account or Group</h3>

            <form onSubmit={handleAddAccount} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Platform</label>
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs text-slate-800"
                >
                  <option value="facebook">Facebook (Group or Page)</option>
                  <option value="reddit">Reddit (Subreddit / Community)</option>
                  <option value="instagram">Instagram</option>
                  <option value="x">X / Twitter</option>
                  <option value="linkedin">LinkedIn (Group or Profile)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Name / Handle</label>
                <input
                  type="text"
                  required
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder="e.g. Coffee Lovers Club (Facebook Group)"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs text-slate-800"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Direct Target URL</label>
                <input
                  type="text"
                  value={groupUrl}
                  onChange={(e) => setGroupUrl(e.target.value)}
                  placeholder="e.g. https://facebook.com/groups/coffee-lovers"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs text-slate-800"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={isGroup}
                  onChange={(e) => setIsGroup(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span>This target is a Community or Group (uses Locoagent Group flow)</span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
                >
                  Save Target
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
