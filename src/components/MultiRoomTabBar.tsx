import React from 'react';
import { Home, Plus, X, Lock, MessagesSquare } from 'lucide-react';
import { Room, RoomMember } from '../types';

export interface OpenRoomSession {
  room: Room;
  session: RoomMember;
  unreadCount: number;
}

interface MultiRoomTabBarProps {
  openRooms: OpenRoomSession[];
  activeRoomId: string | null;
  onSelectRoom: (roomId: string) => void;
  onGoHome: () => void;
  onCloseRoom: (roomId: string) => void;
  onOpenJoin: () => void;
  onOpenCreate: () => void;
}

export const MultiRoomTabBar: React.FC<MultiRoomTabBarProps> = ({
  openRooms,
  activeRoomId,
  onSelectRoom,
  onGoHome,
  onCloseRoom,
  onOpenJoin,
  onOpenCreate,
}) => {
  if (openRooms.length === 0) return null;

  return (
    <div className="bg-zinc-950 border-b border-zinc-800/80 px-3 py-1.5 flex items-center justify-between gap-2 overflow-x-auto select-none scrollbar-thin">
      <div className="flex items-center space-x-1.5 min-w-0">
        {/* Home / Lobby Tab */}
        <button
          id="tab-home-lobby"
          onClick={onGoHome}
          className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 ${
            activeRoomId === null
              ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700/80'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-transparent'
          }`}
          title="Lobby / All Rooms"
        >
          <Home className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Lobby</span>
        </button>

        {/* Separator */}
        <div className="h-4 w-px bg-zinc-800 shrink-0 mx-1" />

        {/* List of open rooms */}
        {openRooms.map(({ room, session, unreadCount }) => {
          const isActive = activeRoomId === room.id;
          const isLocked = room.status === 'locked';

          return (
            <div
              key={room.id}
              className={`group flex items-center space-x-1.5 pl-2.5 pr-1.5 py-1 rounded-lg text-xs transition-all shrink-0 max-w-[220px] ${
                isActive
                  ? 'bg-zinc-900 text-white border border-emerald-500/40 shadow-sm'
                  : 'bg-zinc-950/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 border border-zinc-800/80'
              }`}
            >
              <button
                id={`tab-select-${room.room_code}`}
                onClick={() => onSelectRoom(room.id)}
                className="flex items-center space-x-1.5 truncate text-left focus:outline-none"
              >
                {/* Status indicator */}
                {isLocked ? (
                  <Lock className="w-3 h-3 text-amber-400 shrink-0" />
                ) : (
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      isActive ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-zinc-600'
                    }`}
                  />
                )}

                {/* Room Code */}
                <span className="font-mono font-semibold text-[11px] text-emerald-400/90 shrink-0">
                  #{room.room_code}
                </span>

                {/* Room Name */}
                <span className="truncate max-w-[80px] font-medium text-zinc-200">{room.name}</span>

                {/* User Handle */}
                <span className="text-[10px] text-zinc-500 truncate hidden md:inline">
                  @{session.username}
                </span>

                {/* Unread Counter Badge */}
                {unreadCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-500 text-white animate-pulse">
                    +{unreadCount}
                  </span>
                )}
              </button>

              {/* Close Tab Button */}
              <button
                id={`tab-close-${room.room_code}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseRoom(room.id);
                }}
                className="p-1 rounded-md text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 transition-colors shrink-0 opacity-70 group-hover:opacity-100"
                title="Close room tab"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Quick Add Tab / Actions */}
      <div className="flex items-center space-x-1 shrink-0 ml-2">
        <button
          id="tab-quick-join"
          onClick={onOpenJoin}
          className="flex items-center space-x-1 px-2 py-1 rounded-md text-xs font-medium text-zinc-400 hover:text-emerald-400 hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-colors"
          title="Join another room simultaneously"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Join</span>
        </button>

        <button
          id="tab-quick-create"
          onClick={onOpenCreate}
          className="flex items-center space-x-1 px-2 py-1 rounded-md text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-colors"
          title="Create another room simultaneously"
        >
          <MessagesSquare className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">New Room</span>
        </button>
      </div>
    </div>
  );
};
