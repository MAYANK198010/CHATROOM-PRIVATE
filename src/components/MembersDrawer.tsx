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

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50 backdrop-blur-xs animate-in fade-in duration-100">
      <div className="w-full max-w-xs bg-zinc-900 border-l border-zinc-800 h-full flex flex-col shadow-2xl">
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-zinc-800 bg-zinc-950">
          <div className="flex items-center space-x-2">
            <Users className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">Room Members</h3>
            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
              {members.length}
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
          <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 pb-1">
            Active in Room
          </div>

          <div className="space-y-1.5">
            {members.map((m) => {
              const isSelf = m.session_id === currentMember.session_id;

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
                      <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-zinc-900" />
                    </div>

                    <div className="truncate">
                      <div className="flex items-center space-x-1.5 truncate">
                        <span className="text-xs font-semibold text-white truncate">{m.username}</span>
                        {isSelf && (
                          <span className="text-[9px] px-1 rounded bg-zinc-800 text-zinc-400 font-mono">
                            You
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
