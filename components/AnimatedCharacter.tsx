"use client";

import { useState, useEffect } from "react";

interface AnimatedCharacterProps {
  seatNumber: 1 | 2 | 3 | 4;
  agentId: string;
  agentName: string;
  agentRole: string;
  agentStatus: "idle" | "running" | "done" | "paused";
  avatarEmoji: string;
  isSelected?: boolean;
  onClick?: () => void;
  coords: {
    leftPercent: number;
    topPercent: number;
    widthPercent: number;
  };
  zIndex?: number;
  zoneColor?: "red" | "yellow" | "green" | "blue" | "purple";
  isDraggable?: boolean;
  isDragging?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  scale?: number;
}

const SEAT_FRAME_COUNTS: Record<number, number> = {
  1: 6,
  2: 8,
  3: 7,
  4: 6,
};

export function AnimatedCharacter({
  seatNumber,
  agentId,
  agentName,
  agentRole,
  agentStatus,
  avatarEmoji,
  isSelected,
  onClick,
  coords,
  zIndex,
  zoneColor = "blue",
  isDraggable = false,
  isDragging = false,
  onPointerDown,
  scale = 1.0,
}: AnimatedCharacterProps) {
  const [frameIndex, setFrameIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  const totalFrames = SEAT_FRAME_COUNTS[seatNumber] || 6;
  const isRunning = agentStatus === "running";

  // Preload all character typing sprite frames into browser memory so frames never drop or freeze
  useEffect(() => {
    if (typeof window !== "undefined") {
      for (let i = 0; i < totalFrames; i++) {
        const img = new Image();
        img.src = `/characters/seat-${seatNumber}/typing_${i}.png`;
      }
    }
  }, [seatNumber, totalFrames]);

  useEffect(() => {
    // Only animate typing when the agent is actively running tasks
    // When idle/resting/completed, character stays completely still/fixed as requested
    if (!isRunning) {
      setFrameIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % totalFrames);
    }, 120);

    return () => clearInterval(interval);
  }, [isRunning, totalFrames]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "running":
        return { text: "text-blue-400", dot: "bg-blue-400", label: "Typing & Posting" };
      case "done":
        return { text: "text-emerald-400", dot: "bg-emerald-400", label: "Completed" };
      case "paused":
        return { text: "text-amber-400", dot: "bg-amber-400", label: "Paused" };
      default:
        return { text: "text-slate-400", dot: "bg-slate-300", label: "Resting" };
    }
  };

  const status = getStatusColor(agentStatus);

  // Computed z-index: foreground has higher topPercent, dragging has top zIndex
  const computedZIndex = isDragging
    ? 50
    : isHovered
    ? 45
    : isSelected
    ? 40
    : zIndex || Math.round(coords.topPercent);

  // Dynamic badge alignment to avoid edge clipping
  const badgeTranslate =
    coords.leftPercent > 85
      ? "-translate-x-3/4"
      : coords.leftPercent < 18
      ? "-translate-x-1/4"
      : "-translate-x-1/2";

  return (
    <div
      onClick={isDraggable ? undefined : onClick}
      onPointerDown={onPointerDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        left: `${coords.leftPercent}%`,
        top: `${coords.topPercent}%`,
        width: `${coords.widthPercent * scale}%`,
        zIndex: computedZIndex,
      }}
      className={`absolute -translate-x-1/2 -translate-y-[88%] select-none transition-transform duration-100 ${
        isDraggable
          ? "cursor-grab active:cursor-grabbing touch-none"
          : "cursor-pointer"
      } ${isDragging ? "scale-115 drop-shadow-2xl" : isHovered ? "scale-105" : ""} ${
        isSelected && !isDraggable ? "scale-105" : ""
      }`}
    >
      {/* Dynamic Keyframes for Continuous Body Typing Bob and Keyboard Keystroke Activity */}
      <style jsx>{`
        @keyframes avatarTypingBounce {
          0%, 100% {
            transform: translateY(0px) scale(1);
          }
          25% {
            transform: translateY(-2px) scale(1.01);
          }
          50% {
            transform: translateY(0.5px) scale(1);
          }
          75% {
            transform: translateY(-1.4px) scale(1.005);
          }
        }
        @keyframes keyTapFlash {
          0%, 100% {
            opacity: 0.15;
            transform: scale(0.7);
          }
          50% {
            opacity: 0.95;
            transform: scale(1.35);
          }
        }
      `}</style>

      {/* Ground Floor Shadow & Seat Base (Anchors the chair wheels firmly to the ground) */}
      <div
        className={`absolute bottom-[10%] left-1/2 -translate-x-1/2 w-4/5 h-3.5 rounded-full blur-xs pointer-events-none transition-all duration-300 ${
          isDragging
            ? "bg-amber-400/50 scale-140"
            : isSelected
            ? "bg-blue-500/40 scale-125"
            : isHovered
            ? "bg-white/30 scale-110"
            : "bg-black/45"
        }`}
      />

      {/* Floating Name Badge above character (moves directly with the agent) */}
      <div
        className={`absolute bottom-[92%] left-1/2 ${badgeTranslate} mb-1 pointer-events-none whitespace-nowrap z-30 transition-transform duration-150`}
      >
        <div
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-semibold tracking-tight backdrop-blur-md shadow-lg transition-all duration-200 border ${
            isDragging
              ? "bg-amber-500 text-slate-950 border-amber-300 ring-2 ring-amber-300/60 shadow-amber-500/40 scale-110"
              : isSelected
              ? "bg-blue-600 text-white border-blue-400 ring-2 ring-blue-400/50 shadow-blue-500/30 scale-105"
              : isHovered
              ? "bg-slate-900/95 text-white border-white/40 shadow-xl"
              : "bg-slate-900/80 text-white/90 border-white/20"
          }`}
        >
          <span>{avatarEmoji}</span>
          <span className="font-bold">{agentName}</span>
          {isDragging ? (
            <span className="text-[9px] font-mono text-slate-950 font-bold bg-amber-200 px-1.5 py-0.2 rounded-full">
              {coords.leftPercent.toFixed(1)}%, {coords.topPercent.toFixed(1)}%
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[9.5px] opacity-90 pl-1 border-l border-white/20">
              <span
                className={`w-1.5 h-1.5 rounded-full ${status.dot} ${
                  isRunning ? "animate-pulse" : ""
                }`}
              />
              {status.label}
            </span>
          )}
        </div>
      </div>

      {/* Dragging Target Ring */}
      {isDraggable && (
        <div
          className={`absolute -inset-2 rounded-2xl border-2 pointer-events-none transition-all ${
            isDragging
              ? "border-amber-400 bg-amber-400/15 animate-pulse shadow-[0_0_15px_rgba(251,191,36,0.5)]"
              : "border-dashed border-white/40 hover:border-white/80"
          }`}
        />
      )}

      {/* Selected Active Glow Halo */}
      {isSelected && !isDraggable && (
        <div className="absolute inset-0 -m-2 rounded-2xl border-2 border-blue-400 bg-blue-500/10 shadow-[0_0_20px_rgba(59,130,246,0.4)] pointer-events-none animate-pulse" />
      )}

      {/* Seated Character Sprite: Typing Bounce ONLY when actively running */}
      <div
        className="relative w-full aspect-[332/501]"
        style={{
          animation: isRunning ? "avatarTypingBounce 0.38s ease-in-out infinite" : "none",
        }}
      >
        <img
          src={`/characters/seat-${seatNumber}/typing_${frameIndex}.png`}
          alt={agentName}
          draggable={false}
          className="w-full h-full object-contain pointer-events-none filter drop-shadow-md select-none transition-all duration-75"
        />

        {/* Luminous Keystroke Tapping Glow at Keyboard Level ONLY when actively running */}
        {isRunning && (
          <div className="absolute bottom-[27%] left-[25%] right-[25%] h-3 flex items-center justify-around pointer-events-none z-20">
            <span
              className="w-1.5 h-1.5 rounded-full bg-cyan-300 blur-[0.8px]"
              style={{ animation: "keyTapFlash 0.24s ease-in-out infinite" }}
            />
            <span
              className="w-1.5 h-1.5 rounded-full bg-amber-300 blur-[0.8px]"
              style={{ animation: "keyTapFlash 0.28s ease-in-out 0.12s infinite" }}
            />
            <span
              className="w-1.5 h-1.5 rounded-full bg-emerald-300 blur-[0.8px]"
              style={{ animation: "keyTapFlash 0.22s ease-in-out 0.24s infinite" }}
            />
          </div>
        )}

        {/* Screen light glow on character face/hands when actively typing */}
        {isRunning && (
          <div className="absolute bottom-1/3 left-1/4 right-1/4 h-6 bg-blue-400/30 rounded-full blur-xs pointer-events-none animate-pulse" />
        )}
      </div>
    </div>
  );
}
