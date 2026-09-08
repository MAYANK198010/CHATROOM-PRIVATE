import React, { useState } from 'react';
import { X, ShieldAlert, Users, Settings, UserX, Clock, Lock, Unlock, AlertTriangle, CheckCircle, Ban, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { Room, RoomMember, BanRecord, JoinRequest, RoomRole } from '../types';
import { roomEngine } from '../services/roomEngine';

interface AdminPanelModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: Room;
  currentMember: RoomMember;
  members: RoomMember[];
  bans: BanRecord[];
  requests: JoinRequest[];
  onRefreshRoom: () => void;
}

export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({
  isOpen,
  onClose,
  room,
  currentMember,
  members,
  bans,
  requests,
  onRefreshRoom,
}) => {
  const [activeTab, setActiveTab] = useState<'members' | 'settings' | 'requests' | 'bans'>('members');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!isOpen) return null;

  const isOwner = currentMember.role === 'owner';
  const isModerator = currentMember.role === 'moderator';
  const hasAdminRights = isOwner || isModerator;

  const showNotification = (msg: string, isErr = false) => {
    if (isErr) {
      setError(msg);
      setTimeout(() => setError(''), 4000);
    } else {
      setSuccess(msg);
      setTimeout(() => setSuccess(''), 3000);
    }
  };

  const handleKick = (target: RoomMember) => {
    const res = roomEngine.removeMember({
      roomId: room.id,
      adminSessionId: currentMember.session_id,
      targetSessionId: target.session_id,
    });
    if (res.success) {
      showNotification(`Removed ${target.username} from room.`);
      onRefreshRoom();
    } else {
      showNotification(res.error || 'Failed to remove member.', true);
    }
  };

  const handleBan = (target: RoomMember) => {
    const res = roomEngine.banMember({
      roomId: room.id,
      adminSessionId: currentMember.session_id,
      targetSessionId: target.session_id,
      reason: 'Banned by admin',
    });
    if (res.success) {
      showNotification(`Banned ${target.username} and blacklisted session.`);
      onRefreshRoom();
    } else {
      showNotification(res.error || 'Failed to ban member.', true);
    }
  };

  const handleUnban = (banId: string, username: string) => {
    const res = roomEngine.unbanMember({
      roomId: room.id,
      adminSessionId: currentMember.session_id,
      banId,
    });
    if (res.success) {
      showNotification(`Revoked ban for ${username}.`);
      onRefreshRoom();
    } else {
      showNotification(res.error || 'Failed to unban user.', true);
    }
  };

  const handleToggleRole = (target: RoomMember, newRole: RoomRole) => {
    if (newRole !== 'moderator' && newRole !== 'member') return;
    const res = roomEngine.setMemberRole({
      roomId: room.id,
      adminSessionId: currentMember.session_id,
      targetSessionId: target.session_id,
      newRole,
    });
    if (res.success) {
      showNotification(`Updated role for ${target.username} to ${newRole}.`);
      onRefreshRoom();
    } else {
      showNotification(res.error || 'Failed to update role.', true);
    }
  };

  const handleToggleLock = () => {
    const res = roomEngine.toggleRoomLock({
      roomId: room.id,
      adminSessionId: currentMember.session_id,
    });
    if (res.success) {
      showNotification(res.newStatus === 'locked' ? 'Room locked. Only moderators can chat.' : 'Room unlocked.');
      onRefreshRoom();
    } else {
      showNotification(res.error || 'Failed to toggle lock.', true);
    }
  };

  const handleSlowModeChange = (seconds: number) => {
    const res = roomEngine.setSlowMode({
      roomId: room.id,
      adminSessionId: currentMember.session_id,
      slowModeSeconds: seconds,
    });
    if (res.success) {
      showNotification(`Slow mode set to ${seconds === 0 ? 'Disabled' : `${seconds}s`}.`);
      onRefreshRoom();
    } else {
      showNotification(res.error || 'Failed to set slow mode.', true);
    }
  };

  const handleDecideRequest = (requestId: string, approved: boolean) => {
    const res = roomEngine.decideJoinRequest({
      roomId: room.id,
      adminSessionId: currentMember.session_id,
      requestId,
      approved,
    });
    if (res.success) {
      showNotification(approved ? 'User approved and admitted.' : 'Join request rejected.');
      onRefreshRoom();
    } else {
      showNotification(res.error || 'Failed to process request.', true);
    }
  };

  const handleEndRoom = () => {
    if (!confirm('Are you sure you want to end this room? All participants will be disconnected immediately and the room will be marked ended.')) {
      return;
    }
    const res = roomEngine.endRoom({
      roomId: room.id,
      adminSessionId: currentMember.session_id,
    });
    if (res.success) {
      showNotification('Room has been ended.');
      onRefreshRoom();
      onClose();
    } else {
      showNotification(res.error || 'Failed to end room.', true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-950">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-semibold text-white">ChatRoom Admin Center</h2>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                  #{room.room_code}
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                You are logged in as <span className="text-white font-medium">{currentMember.username}</span> ({currentMember.role.toUpperCase()})
              </p>
            </div>
          </div>
          <button
            id="admin-panel-close-btn"
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-zinc-800 bg-zinc-950/60 px-5 text-xs font-medium space-x-4">
          <button
            onClick={() => setActiveTab('members')}
            className={`py-3 border-b-2 transition-colors flex items-center space-x-1.5 ${
              activeTab === 'members'
                ? 'border-emerald-500 text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Members ({members.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`py-3 border-b-2 transition-colors flex items-center space-x-1.5 ${
              activeTab === 'settings'
                ? 'border-emerald-500 text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Room Controls</span>
          </button>

          {room.join_mode === 'approval' && (
            <button
              onClick={() => setActiveTab('requests')}
              className={`py-3 border-b-2 transition-colors flex items-center space-x-1.5 ${
                activeTab === 'requests'
                  ? 'border-emerald-500 text-white'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Pending Requests ({requests.filter((r) => r.status === 'pending').length})</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('bans')}
            className={`py-3 border-b-2 transition-colors flex items-center space-x-1.5 ${
              activeTab === 'bans'
                ? 'border-emerald-500 text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Ban className="w-3.5 h-3.5" />
            <span>Banned ({bans.length})</span>
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mx-5 mt-4 p-3 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="mx-5 mt-4 p-3 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {!hasAdminRights && (
            <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 text-center space-y-2">
              <ShieldAlert className="w-8 h-8 text-amber-400 mx-auto" />
              <h3 className="text-sm font-semibold text-white">Administrator Access Required</h3>
              <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                Only the Room Owner (👑) and designated Moderators (🛡️) can execute administration commands.
              </p>
            </div>
          )}

          {hasAdminRights && activeTab === 'members' && (
            <div className="space-y-3">
              <div className="text-xs text-zinc-400 flex items-center justify-between">
                <span>Active participants in room</span>
                <span className="font-mono">Owner & Moderator actions</span>
              </div>

              <div className="divide-y divide-zinc-800 border border-zinc-800 rounded-lg overflow-hidden bg-zinc-950">
                {members.map((m) => {
                  const isSelf = m.session_id === currentMember.session_id;
                  const isTargetOwner = m.role === 'owner';
                  const isTargetMod = m.role === 'moderator';

                  return (
                    <div key={m.session_id} className="p-3 flex items-center justify-between gap-2">
                      <div className="flex items-center space-x-3 truncate">
                        <div className={`w-8 h-8 rounded-full ${m.color} text-white text-xs font-bold flex items-center justify-center shrink-0`}>
                          {m.username.charAt(0).toUpperCase()}
                        </div>
                        <div className="truncate">
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-semibold text-white truncate">{m.username}</span>
                            {isSelf && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 font-mono">
                                (You)
                              </span>
                            )}
                          </div>
                          <div className="flex items-center space-x-2 text-[11px] text-zinc-400">
                            {isTargetOwner && <span className="text-amber-400 font-medium">👑 Room Owner</span>}
                            {isTargetMod && <span className="text-indigo-400 font-medium">🛡️ Moderator</span>}
                            {m.role === 'member' && <span>👤 Member</span>}
                            <span>•</span>
                            <span className="text-emerald-400">Online</span>
                          </div>
                        </div>
                      </div>

                      {/* Action buttons */}
                      {!isSelf && !isTargetOwner && (
                        <div className="flex items-center space-x-1 shrink-0">
                          {/* Owner only role assignment */}
                          {isOwner && (
                            <>
                              {isTargetMod ? (
                                <button
                                  onClick={() => handleToggleRole(m, 'member')}
                                  title="Demote to Member"
                                  className="p-1.5 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors text-xs flex items-center space-x-1"
                                >
                                  <ArrowDownCircle className="w-4 h-4 text-zinc-400" />
                                  <span className="hidden sm:inline">Demote</span>
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleToggleRole(m, 'moderator')}
                                  title="Promote to Moderator"
                                  className="p-1.5 rounded text-indigo-400 hover:text-indigo-300 hover:bg-indigo-950/40 transition-colors text-xs flex items-center space-x-1"
                                >
                                  <ArrowUpCircle className="w-4 h-4" />
                                  <span className="hidden sm:inline">Make Mod</span>
                                </button>
                              )}
                            </>
                          )}

                          {/* Kick */}
                          <button
                            onClick={() => handleKick(m)}
                            title="Remove from room"
                            className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors"
                          >
                            Kick
                          </button>

                          {/* Ban */}
                          <button
                            onClick={() => handleBan(m)}
                            title="Ban session"
                            className="px-2 py-1 rounded bg-rose-950/50 hover:bg-rose-900 border border-rose-800/60 text-rose-300 text-xs font-medium transition-colors"
                          >
                            Ban
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {hasAdminRights && activeTab === 'settings' && (
            <div className="space-y-5">
              {/* Emergency Lock */}
              <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-semibold text-white">Room Lock</span>
                    <span
                      className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded ${
                        room.status === 'locked' ? 'bg-amber-950 text-amber-400 border border-amber-800' : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {room.status === 'locked' ? 'Locked' : 'Open'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400">
                    When locked, regular members cannot post messages. Only Owners and Moderators can speak.
                  </p>
                </div>
                <button
                  onClick={handleToggleLock}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors ${
                    room.status === 'locked'
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'bg-amber-600 hover:bg-amber-500 text-zinc-950'
                  }`}
                >
                  {room.status === 'locked' ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                  <span>{room.status === 'locked' ? 'Unlock Room' : 'Lock Room'}</span>
                </button>
              </div>

              {/* Slow Mode */}
              <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 space-y-3">
                <div>
                  <h4 className="text-sm font-semibold text-white">Slow Mode (Rate Throttling)</h4>
                  <p className="text-xs text-zinc-400">
                    Limits how frequently each member can post messages to prevent flooding.
                  </p>
                </div>
                {isOwner ? (
                  <div className="grid grid-cols-4 gap-2">
                    {[0, 5, 15, 30].map((sec) => (
                      <button
                        key={sec}
                        onClick={() => handleSlowModeChange(sec)}
                        className={`py-2 px-3 rounded-lg text-xs font-medium border transition-colors ${
                          room.slow_mode_seconds === sec
                            ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                        }`}
                      >
                        {sec === 0 ? 'Disabled' : `${sec} seconds`}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500 italic">Only the Room Owner can alter Slow Mode duration.</p>
                )}
              </div>

              {/* End Room (Owner only) */}
              {isOwner && (
                <div className="p-4 rounded-lg bg-rose-950/20 border border-rose-900/50 space-y-2">
                  <div className="flex items-center space-x-2 text-rose-400">
                    <UserX className="w-4 h-4" />
                    <h4 className="text-sm font-semibold">Destroy & End Room</h4>
                  </div>
                  <p className="text-xs text-zinc-400">
                    Immediately terminates the room, disconnects all users, and marks room as ended.
                  </p>
                  <button
                    onClick={handleEndRoom}
                    className="mt-2 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-colors flex items-center space-x-1.5"
                  >
                    <span>End Room Immediately</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {hasAdminRights && activeTab === 'requests' && (
            <div className="space-y-3">
              <div className="text-xs text-zinc-400">
                Pending join requests requiring administrator authorization:
              </div>
              {requests.filter((r) => r.status === 'pending').length === 0 ? (
                <div className="p-6 text-center text-xs text-zinc-500 border border-zinc-800 rounded-lg bg-zinc-950">
                  No pending join requests.
                </div>
              ) : (
                <div className="divide-y divide-zinc-800 border border-zinc-800 rounded-lg bg-zinc-950 overflow-hidden">
                  {requests
                    .filter((r) => r.status === 'pending')
                    .map((req) => (
                      <div key={req.id} className="p-3 flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-white">{req.username}</div>
                          <div className="text-[11px] text-zinc-400">
                            Requested {new Date(req.requested_at).toLocaleTimeString()}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleDecideRequest(req.id, true)}
                            className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleDecideRequest(req.id, false)}
                            className="px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {hasAdminRights && activeTab === 'bans' && (
            <div className="space-y-3">
              <div className="text-xs text-zinc-400">
                Banned sessions from this room:
              </div>
              {bans.length === 0 ? (
                <div className="p-6 text-center text-xs text-zinc-500 border border-zinc-800 rounded-lg bg-zinc-950">
                  No active bans recorded.
                </div>
              ) : (
                <div className="divide-y divide-zinc-800 border border-zinc-800 rounded-lg bg-zinc-950 overflow-hidden">
                  {bans.map((ban) => (
                    <div key={ban.id} className="p-3 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold text-rose-400">{ban.username}</div>
                        <div className="text-[11px] text-zinc-400">
                          Reason: {ban.reason} • {new Date(ban.banned_at).toLocaleTimeString()}
                        </div>
                      </div>
                      {isOwner ? (
                        <button
                          onClick={() => handleUnban(ban.id, ban.username)}
                          className="px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors"
                        >
                          Revoke Ban
                        </button>
                      ) : (
                        <span className="text-[11px] text-zinc-500 italic">Owner only unban</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
