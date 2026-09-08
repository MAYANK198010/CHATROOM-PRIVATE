import React, { useState } from 'react';
import { Plus, ArrowRight, ShieldCheck, Clock, Users, Lock, QrCode, Sparkles, Check } from 'lucide-react';
import { Room } from '../types';

interface HomeViewProps {
  onCreateRoomClick: () => void;
  onJoinRoomClick: (code?: string) => void;
  onLaunchDemoRoom: () => void;
  allRooms: Room[];
}

export const HomeView: React.FC<HomeViewProps> = ({
  onCreateRoomClick,
  onJoinRoomClick,
  onLaunchDemoRoom,
  allRooms,
}) => {
  const [roomCodeInput, setRoomCodeInput] = useState('');

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomCodeInput.trim()) {
      onJoinRoomClick(roomCodeInput.trim().toUpperCase());
    }
  };

  return (
    <div className="min-h-[calc(100vh-60px)] flex flex-col justify-between py-8 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto w-full space-y-12">
        {/* Hero Section */}
        <div className="text-center space-y-5 pt-4 sm:pt-8">
          <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium tracking-wide">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Temporary, privacy-first communication</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white">
            ChatRoom
          </h1>

          <p className="text-lg sm:text-xl text-zinc-400 max-w-xl mx-auto leading-relaxed">
            Temporary conversations. <br className="hidden sm:block" />
            <span className="text-zinc-200 font-medium">No account required.</span>
          </p>

          {/* Action CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              id="home-create-room-btn"
              onClick={onCreateRoomClick}
              className="w-full sm:w-auto px-6 py-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center space-x-2 active:scale-98"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Create Room</span>
            </button>

            <button
              id="home-join-room-btn"
              onClick={() => onJoinRoomClick()}
              className="w-full sm:w-auto px-6 py-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 font-semibold text-sm border border-zinc-800 transition-colors flex items-center justify-center space-x-2"
            >
              <span>Join via Code</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Direct Code Entry Quick Form */}
          <form onSubmit={handleJoinSubmit} className="max-w-xs mx-auto pt-2">
            <div className="relative flex items-center">
              <input
                id="home-quick-code-input"
                type="text"
                value={roomCodeInput}
                onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                placeholder="Or enter 6-char code (e.g. X7K9PQ)"
                maxLength={10}
                className="w-full bg-zinc-900/90 border border-zinc-800 rounded-md py-2 pl-3 pr-16 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 font-mono"
              />
              <button
                type="submit"
                disabled={!roomCodeInput.trim()}
                className="absolute right-1 px-2.5 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 rounded font-medium transition-colors"
              >
                Join
              </button>
            </div>
          </form>
        </div>

        {/* Demo Room Instant Launcher Banner */}
        <div className="bg-gradient-to-r from-zinc-900 via-zinc-900/90 to-zinc-900 border border-zinc-800 rounded-xl p-5 sm:p-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-start space-x-3 text-left">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 mt-0.5">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-semibold text-white">Try Pre-seeded Demo Room</h2>
                <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-zinc-800 text-indigo-300 font-medium">
                  Code: X7K9PQ
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                Experience the &quot;College Project&quot; room with pre-seeded discussion between Mayank (Owner), Priya (Moderator), and Rahul.
              </p>
            </div>
          </div>
          <button
            id="home-demo-room-btn"
            onClick={onLaunchDemoRoom}
            className="w-full md:w-auto px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition-colors shrink-0 shadow-sm flex items-center justify-center space-x-2"
          >
            <span>Enter Demo Room</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Core Principles Grid from Section 0 */}
        <div className="space-y-4">
          <div className="text-center">
            <h2 className="text-xs font-mono uppercase tracking-widest text-zinc-500">Core Principles</h2>
            <p className="text-base font-semibold text-zinc-200 mt-1">Built strictly around zero-trace communication</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { title: 'NO PHONE NUMBER', desc: 'Never require mobile verification', icon: ShieldCheck },
              { title: 'NO REQUIRED EMAIL', desc: 'Zero spam or inbox tracking', icon: Lock },
              { title: 'NO PERMANENT PROFILE', desc: 'Identity exists only in this room', icon: Users },
              { title: 'NO CONTACT LIST', desc: 'No address book crawling', icon: Check },
              { title: 'TEMPORARY USERNAME', desc: 'Set on entry, wiped on exit', icon: Sparkles },
              { title: 'TEMPORARY ROOM', desc: 'Hard expiration with automated purge', icon: Clock },
              { title: 'ADMIN MODERATION', desc: 'Kick, ban, lock, and slow mode', icon: ShieldCheck },
              { title: 'INSTANT QR & LINK', desc: 'Join under 30 seconds via link', icon: QrCode },
            ].map((p, idx) => (
              <div
                key={idx}
                className="bg-zinc-900/60 border border-zinc-800/80 rounded-lg p-3.5 space-y-1 hover:border-zinc-700 transition-colors"
              >
                <div className="flex items-center space-x-2">
                  <p.icon className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="font-mono text-[11px] font-bold tracking-tight text-zinc-200">{p.title}</span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-snug">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Active Local Rooms If Any */}
        {allRooms.length > 0 && (
          <div className="border-t border-zinc-800/60 pt-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                Active Rooms On This Device ({allRooms.length})
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {allRooms.map((r) => {
                const isExpired = r.status === 'expired' || Date.now() >= r.expires_at;
                return (
                  <button
                    key={r.id}
                    onClick={() => onJoinRoomClick(r.room_code)}
                    className="p-3.5 rounded-lg bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700 text-left transition-all flex items-center justify-between group"
                  >
                    <div className="space-y-1 truncate pr-2">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-semibold text-white group-hover:text-emerald-400 transition-colors truncate">
                          {r.name}
                        </span>
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                          #{r.room_code}
                        </span>
                      </div>
                      <div className="flex items-center space-x-3 text-[11px] text-zinc-400 font-mono">
                        <span>Mode: {r.join_mode}</span>
                        <span>•</span>
                        <span className={isExpired ? 'text-rose-400' : 'text-emerald-400'}>
                          {isExpired ? 'Expired' : r.status === 'locked' ? 'Locked' : 'Active'}
                        </span>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-emerald-400 transition-colors shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="max-w-4xl mx-auto w-full pt-8 text-center text-xs text-zinc-500 font-mono">
        ChatRoom • Privacy-first temporary chat engine • Open source reference architecture
      </footer>
    </div>
  );
};
