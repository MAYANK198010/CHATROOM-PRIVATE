import React, { useState, useEffect } from 'react';
import { X, LogIn, Lock, AlertCircle, Clock, CheckCircle2 } from 'lucide-react';
import { Room, RoomMember } from '../types';
import { roomEngine } from '../services/roomEngine';

interface JoinRoomModalProps {
  isOpen: boolean;
  initialCode?: string;
  onClose: () => void;
  onJoinSuccess: (room: Room, session: RoomMember) => void;
}

export const JoinRoomModal: React.FC<JoinRoomModalProps> = ({
  isOpen,
  initialCode = '',
  onClose,
  onJoinSuccess,
}) => {
  const [code, setCode] = useState(initialCode);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [pendingApproval, setPendingApproval] = useState(false);
  const [targetRoom, setTargetRoom] = useState<Room | null>(null);

  useEffect(() => {
    if (initialCode) {
      setCode(initialCode.toUpperCase());
      const r = roomEngine.getRoomByCode(initialCode);
      setTargetRoom(r);
    } else {
      setTargetRoom(null);
    }
  }, [initialCode, isOpen]);

  useEffect(() => {
    if (code.length >= 4) {
      const r = roomEngine.getRoomByCode(code);
      setTargetRoom(r);
    } else {
      setTargetRoom(null);
    }
  }, [code]);

  // Listen for admin approval if waiting
  useEffect(() => {
    if (!pendingApproval || !targetRoom) return;

    const unsubscribe = roomEngine.subscribeToSyncEvents?.((event) => {
      if (event.type === 'JOIN_REQUEST_DECIDED') {
        const payload = event.payload as { requestId: string; status: string; roomId: string };
        if (payload.roomId === targetRoom.id && payload.status === 'accepted') {
          // Re-attempt join to fetch member
          const res = roomEngine.joinRoom({
            roomCode: targetRoom.room_code,
            username,
          });
          if (res.success && res.room && res.member) {
            onJoinSuccess(res.room, res.member);
            onClose();
          }
        } else if (payload.status === 'rejected') {
          setError('Your join request was declined by the room administrator.');
          setPendingApproval(false);
        }
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [pendingApproval, targetRoom, username, onJoinSuccess, onClose]);

  if (!isOpen) return null;

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setStatusMessage('');

    if (!code.trim()) {
      setError('Please enter the 6-character room code.');
      return;
    }
    if (!username.trim()) {
      setError('Please enter a temporary name to participate.');
      return;
    }

    const res = roomEngine.joinRoom({
      roomCode: code.trim().toUpperCase(),
      username: username.trim(),
      password: password.trim() || undefined,
    });

    if (res.success && res.room && res.member) {
      onJoinSuccess(res.room, res.member);
      onClose();
    } else if (res.status === 'pending_approval') {
      setPendingApproval(true);
      setStatusMessage('Join request sent to room owner. Waiting for approval...');
    } else {
      setError(res.error || 'Unable to enter room.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-md overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-md bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <LogIn className="w-4 h-4" />
            </div>
            <h2 className="text-base font-semibold text-white">Join ChatRoom</h2>
          </div>
          <button
            id="join-room-close-btn"
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleJoin} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {statusMessage && (
            <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-medium flex items-center space-x-2">
              <Clock className="w-4 h-4 shrink-0 animate-spin" />
              <span>{statusMessage}</span>
            </div>
          )}

          {/* Room Code */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-300">
              Room Code <span className="text-rose-400">*</span>
            </label>
            <input
              id="join-room-code-input"
              type="text"
              required
              maxLength={10}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. X7K9PQ"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white font-mono tracking-wider placeholder-zinc-500 focus:outline-none focus:border-emerald-500 uppercase"
            />
            {targetRoom && (
              <div className="flex items-center space-x-2 text-[11px] text-emerald-400 font-medium pt-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Found: &quot;{targetRoom.name}&quot;</span>
                <span className="text-zinc-500 font-mono">({targetRoom.join_mode} mode)</span>
              </div>
            )}
          </div>

          {/* Temporary Name */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-300">
              Choose your temporary name <span className="text-rose-400">*</span>
            </label>
            <input
              id="join-username-input"
              type="text"
              required
              maxLength={30}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. Rahul, Alex, or Guest"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
            />
            <p className="text-[11px] text-zinc-400">
              No account created. This name is strictly ephemeral for this discussion.
            </p>
          </div>

          {/* Password field if target room requires password */}
          {targetRoom?.join_mode === 'password' && (
            <div className="space-y-1.5 animate-in fade-in">
              <label className="block text-xs font-medium text-zinc-300 flex items-center space-x-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>Room Password Required</span>
              </label>
              <input
                id="join-password-input"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter room password"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          )}

          {/* Pending approval notice */}
          {pendingApproval && (
            <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg text-center space-y-2">
              <div className="text-xs text-zinc-300 font-medium">Waiting for room administrator</div>
              <p className="text-[11px] text-zinc-400">
                This room is set to approval mode. Once the owner or moderator approves your request, you will automatically enter.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              id="join-room-submit-btn"
              type="submit"
              disabled={pendingApproval}
              className="px-5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-zinc-950 font-semibold text-xs transition-colors flex items-center space-x-1.5 shadow-sm"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Join Room</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
