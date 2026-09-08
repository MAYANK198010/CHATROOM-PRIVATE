import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ArrowLeft,
  Users,
  Clock,
  Shield,
  QrCode,
  Send,
  Trash2,
  Lock,
  Radio,
  Smile,
  Crown,
  AlertCircle,
  Hourglass,
  ExternalLink,
  LogOut,
} from 'lucide-react';
import { Room, RoomMember, Message, BanRecord, JoinRequest } from '../types';
import { roomEngine } from '../services/roomEngine';

interface ChatRoomViewProps {
  room: Room;
  currentMember: RoomMember;
  members: RoomMember[];
  messages: Message[];
  bans: BanRecord[];
  requests: JoinRequest[];
  onLeaveRoom: () => void;
  onOpenAdmin: () => void;
  onOpenShare: () => void;
  onOpenMembers: () => void;
  onSwitchIdentity?: (targetMember: RoomMember) => void;
  onRefresh: () => void;
}

const EMOJIS = ['👍', '❤️', '🔥', '😂', '🎉', '🚀', '👀', '💯'];

export const ChatRoomView: React.FC<ChatRoomViewProps> = ({
  room,
  currentMember,
  members,
  messages,
  bans: _bans,
  requests: _requests,
  onLeaveRoom,
  onOpenAdmin,
  onOpenShare,
  onOpenMembers,
  onSwitchIdentity,
  onRefresh,
}) => {
  const [inputText, setInputText] = useState('');
  const [inputError, setInputError] = useState('');
  const [slowModeCooldown, setSlowModeCooldown] = useState<number>(0);
  const [timeRemainingStr, setTimeRemainingStr] = useState<string>('');
  const [isExpired, setIsExpired] = useState<boolean>(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Expiration countdown ticker
  useEffect(() => {
    const updateCountdown = () => {
      const now = Date.now();
      const diff = room.expires_at - now;
      if (diff <= 0 || room.status === 'expired' || room.status === 'ended') {
        setTimeRemainingStr('Expired');
        setIsExpired(true);
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeRemainingStr(`${hours}h ${minutes}m ${seconds}s`);
        setIsExpired(false);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [room.expires_at, room.status]);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Listen for sync events (e.g. typing)
  useEffect(() => {
    const unsubscribe = roomEngine.subscribeToSyncEvents?.((event) => {
      if (event.type === 'TYPING_STATUS') {
        const payload = event.payload as { roomId: string; sessionId: string; username: string };
        if (payload.roomId === room.id && payload.sessionId !== currentMember.session_id) {
          setTypingUsers((prev) => Array.from(new Set([...prev, payload.username])));
          setTimeout(() => {
            setTypingUsers((prev) => prev.filter((u) => u !== payload.username));
          }, 2500);
        }
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [room.id, currentMember.session_id]);

  // Slow mode cooldown timer
  useEffect(() => {
    if (slowModeCooldown <= 0) return;
    const timer = setTimeout(() => {
      setSlowModeCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearTimeout(timer);
  }, [slowModeCooldown]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    setInputError('');

    // Emit typing indicator with debounce
    if (!typingTimeoutRef.current) {
      roomEngine.emitTyping(room.id, currentMember.session_id, currentMember.username);
      typingTimeoutRef.current = setTimeout(() => {
        typingTimeoutRef.current = null;
      }, 2000);
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    setInputError('');

    if (isExpired) {
      setInputError('This room has expired. Messages cannot be sent.');
      return;
    }

    if (!inputText.trim()) return;

    if (slowModeCooldown > 0 && currentMember.role === 'member') {
      setInputError(`Slow mode active. Please wait ${slowModeCooldown}s.`);
      return;
    }

    const res = roomEngine.sendMessage({
      roomId: room.id,
      sessionId: currentMember.session_id,
      content: inputText.trim(),
    });

    if (res.success) {
      setInputText('');
      setShowEmojiPicker(false);
      if (room.slow_mode_seconds > 0 && currentMember.role === 'member') {
        setSlowModeCooldown(room.slow_mode_seconds);
      }
      onRefresh();
    } else {
      setInputError(res.error || 'Failed to dispatch message.');
    }
  };

  const handleDeleteMessage = (msgId: string) => {
    const res = roomEngine.deleteMessage({
      roomId: room.id,
      sessionId: currentMember.session_id,
      messageId: msgId,
    });
    if (res.success) {
      onRefresh();
    } else {
      alert(res.error || 'Could not delete message');
    }
  };

  const isPrivileged = currentMember.role === 'owner' || currentMember.role === 'moderator';
  const isLockedForMember = room.status === 'locked' && currentMember.role === 'member';

  // Format message time
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const activeMembersCount = useMemo(() => members.length, [members]);

  return (
    <div className="h-[calc(100vh-60px)] flex flex-col bg-zinc-950 text-white select-text">
      {/* Top Room Bar */}
      <div className="border-b border-zinc-800 bg-zinc-900/90 px-4 py-2.5 flex items-center justify-between gap-3 shrink-0">
        {/* Left: Back + Room Info */}
        <div className="flex items-center space-x-3 truncate">
          <button
            id="chat-leave-btn"
            onClick={onLeaveRoom}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors shrink-0"
            title="Leave room and return to home"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="truncate">
            <div className="flex items-center space-x-2">
              <h1 className="text-sm sm:text-base font-bold text-white truncate">{room.name}</h1>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-zinc-800 text-emerald-400 font-semibold shrink-0">
                #{room.room_code}
              </span>
            </div>

            <div className="flex items-center space-x-2 text-[11px] text-zinc-400 mt-0.5 font-mono">
              {/* Expiry Pill */}
              <span className="flex items-center space-x-1 text-zinc-300">
                <Clock className="w-3 h-3 text-zinc-400" />
                <span className={isExpired ? 'text-rose-400 font-semibold' : ''}>
                  {timeRemainingStr}
                </span>
              </span>

              <span>•</span>

              {/* Status */}
              {room.status === 'locked' && (
                <span className="text-amber-400 flex items-center space-x-1 font-semibold">
                  <Lock className="w-3 h-3" />
                  <span>Locked</span>
                </span>
              )}
              {room.status === 'active' && !isExpired && (
                <span className="text-emerald-400 flex items-center space-x-1">
                  <Radio className="w-3 h-3" />
                  <span>Live</span>
                </span>
              )}
              {isExpired && <span className="text-rose-400">Closed</span>}

              {/* Slow mode badge */}
              {room.slow_mode_seconds > 0 && (
                <>
                  <span>•</span>
                  <span className="text-indigo-300 flex items-center space-x-1">
                    <Hourglass className="w-3 h-3" />
                    <span>{room.slow_mode_seconds}s slow</span>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Tools: Identity Pill, Leave Room, Members, Share, Admin */}
        <div className="flex items-center space-x-1.5 shrink-0">
          {/* Current User Identity (Private, Read-Only, No Impersonation) */}
          <div className="hidden sm:flex items-center space-x-1.5 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: currentMember.color || '#10b981' }}
            />
            <span className="font-semibold text-zinc-200">@{currentMember.username}</span>
            <span className="text-[10px] font-mono uppercase px-1 py-0.5 rounded bg-zinc-800 text-zinc-400">
              {currentMember.role}
            </span>
          </div>

          {/* Members Button */}
          <button
            id="chat-open-members-btn"
            onClick={onOpenMembers}
            className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors flex items-center space-x-1.5"
            title="View participants"
          >
            <Users className="w-3.5 h-3.5 text-emerald-400" />
            <span>{activeMembersCount}</span>
          </button>

          {/* Share QR Button */}
          <button
            id="chat-open-share-btn"
            onClick={onOpenShare}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
            title="Share room link & QR code"
          >
            <QrCode className="w-4 h-4 text-zinc-200" />
          </button>

          {/* Admin Button */}
          {isPrivileged && (
            <button
              id="chat-open-admin-btn"
              onClick={onOpenAdmin}
              className="px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-semibold transition-colors flex items-center space-x-1"
              title="Admin Moderation Center"
            >
              <Shield className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Admin</span>
            </button>
          )}

          {/* Leave Room Button */}
          <button
            id="chat-leave-room-header-btn"
            onClick={() => {
              if (confirm(`Are you sure you want to leave #${room.room_code}? Your session will be disconnected.`)) {
                onLeaveRoom();
              }
            }}
            className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold transition-all flex items-center space-x-1.5 ml-1 active:scale-95 cursor-pointer"
            title="Leave room and exit"
          >
            <LogOut className="w-3.5 h-3.5 text-rose-400" />
            <span className="inline">Leave Room</span>
          </button>
        </div>
      </div>

      {/* Private Identity Status Bar for Mobile */}
      <div className="sm:hidden px-4 py-1.5 bg-zinc-900/80 border-b border-zinc-800 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: currentMember.color || '#10b981' }}
          />
          <span className="text-zinc-400">You:</span>
          <span className="font-semibold text-white">@{currentMember.username}</span>
          <span className="text-[10px] font-mono px-1 rounded bg-zinc-800 text-zinc-400 uppercase">
            {currentMember.role}
          </span>
        </div>
        <button
          id="chat-leave-room-mobile-btn"
          onClick={() => {
            if (confirm(`Leave #${room.room_code}? Your temporary session will be disconnected.`)) {
              onLeaveRoom();
            }
          }}
          className="text-rose-400 hover:text-rose-300 flex items-center space-x-1 text-[11px] font-medium"
        >
          <LogOut className="w-3 h-3" />
          <span>Leave Room</span>
        </button>
      </div>

      {/* Message Timeline */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {/* Privacy Notice Banner */}
        <div className="p-3 rounded-lg bg-zinc-900/40 border border-zinc-800/80 max-w-lg mx-auto text-center space-y-1">
          <div className="flex items-center justify-center space-x-1.5 text-xs font-semibold text-emerald-400">
            <Radio className="w-3 h-3 animate-pulse" />
            <span>Ephemeral Room Active</span>
          </div>
          <p className="text-[11px] text-zinc-400">
            Messages are preserved only while this room is active. Zero account logs, zero phone verification.
          </p>
        </div>

        {/* Message Feed */}
        {messages.map((msg) => {
          const isSystem = msg.is_system;
          const isOwn = msg.session_id === currentMember.session_id;
          const isDeleted = Boolean(msg.deleted_at);
          const canDelete =
            !isDeleted &&
            !isSystem &&
            (isOwn || currentMember.role === 'owner' || currentMember.role === 'moderator');

          if (isSystem) {
            return (
              <div key={msg.id} className="flex items-center justify-center my-2">
                <span className="text-[11px] text-zinc-400 bg-zinc-900/70 border border-zinc-800/60 px-3 py-1 rounded-full font-mono">
                  {msg.content}
                </span>
              </div>
            );
          }

          return (
            <div
              key={msg.id}
              className={`flex items-start space-x-2.5 group ${isOwn ? 'flex-row-reverse space-x-reverse' : 'flex-row'}`}
            >
              {/* User Avatar */}
              <div
                className={`w-8 h-8 rounded-full ${roomEngine.getDeterministicColor(msg.sender_name)} text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 shadow-sm`}
              >
                {msg.sender_name.charAt(0).toUpperCase()}
              </div>

              {/* Message Bubble Content */}
              <div
                className={`max-w-[85%] sm:max-w-[70%] rounded-xl p-3 text-sm space-y-1 ${
                  isOwn
                    ? 'bg-emerald-600 text-white rounded-tr-none'
                    : 'bg-zinc-900 border border-zinc-800 text-zinc-100 rounded-tl-none'
                }`}
              >
                {/* Header: Sender Name & Role */}
                <div className={`flex items-center space-x-1.5 text-xs ${isOwn ? 'text-emerald-100 justify-end' : 'text-zinc-400'}`}>
                  <span className="font-semibold text-white">{msg.sender_name}</span>
                  {msg.sender_role === 'owner' && (
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center space-x-0.5">
                      <Crown className="w-2.5 h-2.5" />
                      <span>Owner</span>
                    </span>
                  )}
                  {msg.sender_role === 'moderator' && (
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center space-x-0.5">
                      <Shield className="w-2.5 h-2.5" />
                      <span>Mod</span>
                    </span>
                  )}
                  <span className="text-[10px] text-zinc-400">• {formatTime(msg.created_at)}</span>
                </div>

                {/* Body Text / Soft-Deleted Tombstone */}
                {isDeleted ? (
                  <p className="text-xs italic text-zinc-400 flex items-center space-x-1">
                    <span>🚫 This message was deleted</span>
                    {msg.deleted_by_name && <span className="font-mono">by {msg.deleted_by_name}</span>}
                  </p>
                ) : (
                  <p className="whitespace-pre-wrap break-words text-sm selection:bg-emerald-900 selection:text-white leading-relaxed">
                    {msg.content}
                  </p>
                )}

                {/* Delete Trigger Button */}
                {canDelete && (
                  <div className={`flex ${isOwn ? 'justify-start' : 'justify-end'} pt-1`}>
                    <button
                      onClick={() => handleDeleteMessage(msg.id)}
                      title="Soft-delete message"
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-rose-400 p-0.5 text-xs flex items-center space-x-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span className="text-[10px]">Delete</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Typing Indicator */}
      {typingUsers.length > 0 && (
        <div className="px-5 py-1 text-xs text-zinc-400 italic flex items-center space-x-1.5 animate-pulse bg-zinc-950 border-t border-zinc-900">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span>
            {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
          </span>
        </div>
      )}

      {/* Bottom Message Input Form */}
      <div className="border-t border-zinc-800 bg-zinc-900 p-3 sm:p-4 shrink-0 space-y-2">
        {/* Alerts: Lock / Expiration / Rate limit */}
        {isExpired && (
          <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium flex items-center justify-between">
            <span className="flex items-center space-x-1.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Room duration has expired. All discussions are concluded.</span>
            </span>
            <button
              onClick={onLeaveRoom}
              className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-200 text-xs font-semibold hover:bg-zinc-700"
            >
              Return Home
            </button>
          </div>
        )}

        {isLockedForMember && (
          <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-medium flex items-center space-x-1.5">
            <Lock className="w-4 h-4 shrink-0" />
            <span>This room is locked by an administrator. Only moderators can send messages.</span>
          </div>
        )}

        {inputError && (
          <div className="p-2 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium">
            {inputError}
          </div>
        )}

        {/* Cooldown bar for slow mode */}
        {slowModeCooldown > 0 && currentMember.role === 'member' && (
          <div className="flex items-center justify-between text-[11px] text-indigo-300 font-mono">
            <span>Slow mode cooldown active:</span>
            <span>Wait {slowModeCooldown}s before posting</span>
          </div>
        )}

        {/* Emoji Quick Picker Toolbar */}
        {showEmojiPicker && (
          <div className="flex items-center space-x-1 p-2 bg-zinc-950 border border-zinc-800 rounded-lg animate-in fade-in">
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  setInputText((prev) => prev + emoji);
                  setShowEmojiPicker(false);
                }}
                className="w-8 h-8 rounded hover:bg-zinc-800 flex items-center justify-center text-lg transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="p-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors shrink-0"
            title="Insert emoji"
          >
            <Smile className="w-4 h-4" />
          </button>

          <div className="relative flex-1">
            <input
              id="chat-message-input"
              type="text"
              disabled={isExpired || isLockedForMember}
              maxLength={1000}
              value={inputText}
              onChange={handleInputChange}
              placeholder={
                isExpired
                  ? 'Room expired'
                  : isLockedForMember
                  ? 'Room locked by admin'
                  : `Message #${room.name} as ${currentMember.username}...`
              }
              className="w-full bg-zinc-950 border border-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg py-2.5 pl-3 pr-16 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
            />
            <span className="absolute right-2.5 top-3 text-[10px] font-mono text-zinc-400">
              {inputText.length}/1000
            </span>
          </div>

          <button
            id="chat-send-btn"
            type="submit"
            disabled={!inputText.trim() || isExpired || isLockedForMember || (slowModeCooldown > 0 && currentMember.role === 'member')}
            className="p-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:hover:bg-emerald-500 text-zinc-950 font-bold transition-colors flex items-center justify-center shrink-0 shadow-sm"
            title="Send message (Enter)"
          >
            <Send className="w-4 h-4 stroke-[2.5]" />
          </button>
        </form>

        {/* Second browser hint */}
        <div className="flex items-center justify-between text-[11px] text-zinc-400 px-1">
          <span>Press Enter to send</span>
          <button
            onClick={onOpenShare}
            className="text-emerald-400 hover:underline flex items-center space-x-1"
          >
            <span>Open in 2nd tab or window to test live multi-user sync</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};
