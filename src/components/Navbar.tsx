import React from 'react';
import { Shield, BookOpen, Bug, RefreshCw, Radio } from 'lucide-react';
import { Room } from '../types';

interface NavbarProps {
  currentRoom: Room | null;
  onOpenDocs: () => void;
  onOpenSecurityTests: () => void;
  onResetData: () => void;
  onGoHome: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentRoom,
  onOpenDocs,
  onOpenSecurityTests,
  onResetData,
  onGoHome,
}) => {
  return (
    <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 h-15 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-3">
          <button
            id="nav-logo-btn"
            onClick={onGoHome}
            className="flex items-center space-x-2 text-left group focus:outline-none"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:border-emerald-400 transition-colors">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-white tracking-tight text-base">ChatRoom</span>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/60">
                  Ephemeral
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 hidden sm:block">Zero accounts • No phone • No trace</p>
            </div>
          </button>
        </div>

        {/* Center: Current Room Status if active */}
        {currentRoom && (
          <div className="hidden md:flex items-center space-x-2 bg-zinc-900/90 border border-zinc-800 px-3 py-1 rounded-full text-xs text-zinc-300">
            <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
            <span className="font-medium text-white truncate max-w-[140px]">{currentRoom.name}</span>
            <span className="text-zinc-500">•</span>
            <span className="font-mono text-zinc-400">#{currentRoom.room_code}</span>
          </div>
        )}

        {/* Right Tools: Architecture, Security Tests, Reset */}
        <div className="flex items-center space-x-2">
          <button
            id="nav-open-docs-btn"
            onClick={onOpenDocs}
            className="flex items-center space-x-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md text-zinc-300 bg-zinc-900 hover:bg-zinc-800 hover:text-white border border-zinc-800 transition-colors"
            title="View the 5 Foundational Engineering Specifications"
          >
            <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Architecture Docs</span>
          </button>

          <button
            id="nav-security-tests-btn"
            onClick={onOpenSecurityTests}
            className="flex items-center space-x-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md text-zinc-300 bg-zinc-900 hover:bg-zinc-800 hover:text-white border border-zinc-800 transition-colors"
            title="Phase 8 Security Attack & Defense Test Suite"
          >
            <Bug className="w-3.5 h-3.5 text-rose-400" />
            <span className="hidden sm:inline">Security Tests</span>
          </button>

          <button
            id="nav-reset-data-btn"
            onClick={onResetData}
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-colors"
            title="Reset to initial clean demo data"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
};
