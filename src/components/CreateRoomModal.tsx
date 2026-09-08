import React, { useState } from 'react';
import { X, Shield, Clock, Lock, Sparkles, Check, Copy, QrCode, ArrowRight } from 'lucide-react';
import { JoinMode, Room, RoomMember } from '../types';
import QRCode from 'qrcode';

interface CreateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateSuccess: (room: Room, session: RoomMember) => void;
  onCreate: (params: {
    name: string;
    ownerUsername: string;
    durationMinutes: number;
    joinMode: JoinMode;
    password?: string;
    slowModeSeconds?: number;
  }) => { room: Room; session: RoomMember };
}

export const CreateRoomModal: React.FC<CreateRoomModalProps> = ({
  isOpen,
  onClose,
  onCreateSuccess,
  onCreate,
}) => {
  const [step, setStep] = useState<'form' | 'created'>('form');
  const [name, setName] = useState('');
  const [ownerUsername, setOwnerUsername] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(1440); // 24 hours
  const [joinMode, setJoinMode] = useState<JoinMode>('open');
  const [password, setPassword] = useState('');
  const [slowModeSeconds, setSlowModeSeconds] = useState(0);
  const [error, setError] = useState('');

  // Result state
  const [createdRoom, setCreatedRoom] = useState<Room | null>(null);
  const [createdSession, setCreatedSession] = useState<RoomMember | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Please provide a room name (e.g., "College Project")');
      return;
    }
    if (!ownerUsername.trim()) {
      setError('Please provide your temporary username');
      return;
    }
    if (joinMode === 'password' && !password.trim()) {
      setError('Password is required for password-protected rooms');
      return;
    }

    try {
      const result = onCreate({
        name,
        ownerUsername,
        durationMinutes,
        joinMode,
        password: password.trim() || undefined,
        slowModeSeconds,
      });

      setCreatedRoom(result.room);
      setCreatedSession(result.session);

      // Generate QR Code data URL
      const shareUrl = `${window.location.origin}${window.location.pathname}?r=${result.room.room_code}`;
      const qr = await QRCode.toDataURL(shareUrl, {
        margin: 1,
        width: 220,
        color: {
          dark: '#09090b',
          light: '#ffffff',
        },
      });
      setQrDataUrl(qr);
      setStep('created');
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to create room');
    }
  };

  const handleCopyLink = () => {
    if (!createdRoom) return;
    const shareUrl = `${window.location.origin}${window.location.pathname}?r=${createdRoom.room_code}`;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleEnterRoom = () => {
    if (createdRoom && createdSession) {
      onCreateSuccess(createdRoom, createdSession);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-md overflow-hidden shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-md bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Shield className="w-4 h-4" />
            </div>
            <h2 className="text-base font-semibold text-white">
              {step === 'form' ? 'Create a ChatRoom' : 'Your Room is Ready!'}
            </h2>
          </div>
          <button
            id="create-room-close-btn"
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {step === 'form' ? (
          /* Form Step */
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {error && (
              <div className="p-3 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium">
                {error}
              </div>
            )}

            {/* Room Name */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-300">
                Room Name <span className="text-rose-400">*</span>
              </label>
              <input
                id="create-room-name-input"
                type="text"
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. College Project, Study Group, Hackathon"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Your Temporary Name */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-300">
                Your Temporary Name <span className="text-rose-400">*</span>
              </label>
              <input
                id="create-owner-name-input"
                type="text"
                required
                maxLength={30}
                value={ownerUsername}
                onChange={(e) => setOwnerUsername(e.target.value)}
                placeholder="e.g. Mayank"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
              />
              <p className="text-[11px] text-zinc-400">
                No permanent account. You will hold the Owner role (👑) for this room.
              </p>
            </div>

            {/* Room Duration Selection */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-300 flex items-center space-x-1.5">
                <Clock className="w-3.5 h-3.5 text-zinc-400" />
                <span>Room Expiration Duration</span>
              </label>
              <select
                id="create-duration-select"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
              >
                <option value={5}>5 Minutes (Quick Test / Demo)</option>
                <option value={60}>1 Hour</option>
                <option value={360}>6 Hours</option>
                <option value={1440}>24 Hours (Standard)</option>
                <option value={4320}>72 Hours</option>
              </select>
              <p className="text-[11px] text-zinc-400">
                When expired, all sessions disconnect and messages are immediately purged.
              </p>
            </div>

            {/* Join Mode */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-300 flex items-center space-x-1.5">
                <Lock className="w-3.5 h-3.5 text-zinc-400" />
                <span>Join Permission</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { mode: 'open', label: 'Open', desc: 'Anyone with link' },
                  { mode: 'password', label: 'Password', desc: 'Secret key' },
                  { mode: 'approval', label: 'Approval', desc: 'Admin admits' },
                ].map((m) => (
                  <button
                    key={m.mode}
                    type="button"
                    onClick={() => setJoinMode(m.mode as JoinMode)}
                    className={`p-2 rounded-lg text-left border transition-colors ${
                      joinMode === m.mode
                        ? 'border-emerald-500 bg-emerald-500/10 text-white'
                        : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <div className="text-xs font-semibold">{m.label}</div>
                    <div className="text-[10px] text-zinc-400 leading-tight">{m.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Password input if mode is password */}
            {joinMode === 'password' && (
              <div className="space-y-1.5 animate-in fade-in">
                <label className="block text-xs font-medium text-zinc-300">
                  Room Password <span className="text-rose-400">*</span>
                </label>
                <input
                  id="create-password-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Set secret room password"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
            )}

            {/* Slow Mode Option */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-300">
                Slow Mode (Anti-Spam)
              </label>
              <select
                id="create-slow-mode-select"
                value={slowModeSeconds}
                onChange={(e) => setSlowModeSeconds(Number(e.target.value))}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
              >
                <option value={0}>Disabled (Regular chat)</option>
                <option value={5}>5 seconds per message</option>
                <option value={15}>15 seconds per message</option>
                <option value={30}>30 seconds per message</option>
              </select>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                id="create-room-submit-btn"
                type="submit"
                className="px-5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs transition-colors flex items-center space-x-1.5 shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Create Room</span>
              </button>
            </div>
          </form>
        ) : (
          /* Created Success Screen from Section 42 */
          <div className="p-6 space-y-6 text-center animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
              <Check className="w-6 h-6 stroke-[3]" />
            </div>

            <div className="space-y-1">
              <h2 className="text-xl font-bold text-white">Your room is ready!</h2>
              <p className="text-xs text-zinc-400">
                {createdRoom?.name} • Expires in {Math.round((createdRoom?.expires_at || 0) - (createdRoom?.created_at || 0)) / 3600000}h
              </p>
            </div>

            {/* Room Code Callout */}
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 inline-flex flex-col items-center justify-center">
              <span className="text-[11px] font-mono uppercase text-zinc-400">Room Code</span>
              <span className="text-2xl font-mono font-bold tracking-widest text-emerald-400">
                {createdRoom?.room_code}
              </span>
            </div>

            {/* QR Code */}
            {qrDataUrl && (
              <div className="flex flex-col items-center space-y-2">
                <div className="p-2 bg-white rounded-lg shadow-md inline-block">
                  <img src={qrDataUrl} alt="Room QR Code" className="w-36 h-36" />
                </div>
                <span className="text-[11px] text-zinc-400 flex items-center space-x-1">
                  <QrCode className="w-3 h-3" />
                  <span>Scan with mobile camera to join instantly</span>
                </span>
              </div>
            )}

            {/* Link Copy & Enter Button */}
            <div className="space-y-2 pt-2">
              <button
                id="create-copy-link-btn"
                onClick={handleCopyLink}
                className="w-full py-2.5 px-4 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium text-xs border border-zinc-700 transition-colors flex items-center justify-center space-x-2"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Link Copied to Clipboard!' : 'Copy Room Invite Link'}</span>
              </button>

              <button
                id="create-enter-room-btn"
                onClick={handleEnterRoom}
                className="w-full py-2.5 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs transition-colors flex items-center justify-center space-x-1.5 shadow-lg shadow-emerald-500/20"
              >
                <span>Enter Room Now</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
