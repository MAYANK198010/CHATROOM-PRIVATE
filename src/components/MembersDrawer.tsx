import React from 'react';
import { X, Users, Crown, Shield, User } from 'lucide-react';
import { RoomMember } from '../types';

interface MembersDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  members: RoomMember[];
  currentMember: RoomMember;
  onOpenAdmin: () => void;
}

export const MembersDrawer: React.FC<MembersDrawerProps> = ({
  isOpen,
  onClose,
  members,
  currentMember,
  onOpenAdmin,
}) => {
  if (!isOpen) return null;

  const isPrivileged = currentMember.role === 'owner' || currentMember.role === 'moderator';
  const now = Date.now();

  const isMemberOnline = (m: RoomMember) => {
    if (m.session_id === currentMember.session_id) return true;
    return Boolean(m.is_online && now - m.last_seen < 35000);
  };

  const sortedMembers = [...members].sort((a, b) => {
    const aOnline = isMemberOnline(a);
    const bOnline = isMemberOnline(b);
    if (aOnline && !bOnline) return -1;
    if (!aOnline && bOnline) return 1;
    return b.joined_at - a.joined_at;
  });

  const onlineCount = sortedMembers.filter(isMemberOnline).length;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50 backdrop-blur-xs animate-in fade-in duration-100">
      <div className="w-full max-w-xs bg-zinc-900 border-l border-zinc-800 h-full flex flex-col shadow-2xl">
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-zinc-800 bg-zinc-950">
          <div className="flex items-center space-x-2">
            <Users className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">Room Members</h3>
            <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 font-semibold">
              {onlineCount} active
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Member List */}
        <div className="p-4 flex-1 overflow-y-auto space-y-2">
          <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-zinc-400 pb-1">
            <span>Participants ({members.length})</span>
            <span className="text-emerald-400">{onlineCount} connected</span>
          </div>

          <div className="space-y-1.5">
            {sortedMembers.map((m) => {
              const isSelf = m.session_id === currentMember.session_id;
              const online = isMemberOnline(m);

              return (
                <div
                  key={m.session_id}
                  className="flex items-center justify-between p-2 rounded-lg bg-zinc-950/60 border border-zinc-800/60"
                >
                  <div className="flex items-center space-x-2.5 truncate">
                    <div className="relative shrink-0">
                      <div className={`w-8 h-8 rounded-full ${m.color} text-white text-xs font-bold flex items-center justify-center`}>
                        {m.username.charAt(0).toUpperCase()}
                      </div>
                      <div
                        className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-zinc-900 ${
                          online ? 'bg-emerald-500' : 'bg-zinc-600'
                        }`}
                        title={online ? 'Online' : 'Offline'}
                      />
                    </div>

                    <div className="truncate">
                      <div className="flex items-center space-x-1.5 truncate">
                        <span className="text-xs font-semibold text-white truncate">{m.username}</span>
                        {isSelf && (
                          <span className="text-[9px] px-1 rounded bg-zinc-800 text-zinc-400 font-mono">
                            You
                          </span>
                        )}
                        {!online && (
                          <span className="text-[9px] px-1 rounded bg-zinc-900 text-zinc-500 font-mono">
                            offline
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-1 text-[10px] text-zinc-400">
                        {m.role === 'owner' && (
                          <span className="text-amber-400 flex items-center space-x-0.5 font-medium">
                            <Crown className="w-3 h-3" />
                            <span>Owner</span>
                          </span>
                        )}
                        {m.role === 'moderator' && (
                          <span className="text-indigo-400 flex items-center space-x-0.5 font-medium">
                            <Shield className="w-3 h-3" />
                            <span>Moderator</span>
                          </span>
                        )}
                        {m.role === 'member' && (
                          <span className="flex items-center space-x-0.5">
                            <User className="w-3 h-3" />
                            <span>Member</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer with Admin Shortcut */}
        {isPrivileged && (
          <div className="p-3 border-t border-zinc-800 bg-zinc-950">
            <button
              onClick={() => {
                onClose();
                onOpenAdmin();
              }}
              className="w-full py-2 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors flex items-center justify-center space-x-1.5 border border-zinc-700"
            >
              <Shield className="w-3.5 h-3.5 text-amber-400" />
              <span>Open Admin Dashboard</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
