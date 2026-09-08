import React, { useEffect, useState } from 'react';
import { X, Copy, Check, QrCode, ExternalLink, ShieldCheck } from 'lucide-react';
import { Room } from '../types';
import QRCode from 'qrcode';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: Room;
}

export const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, room }) => {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const roomLink = `${window.location.origin}${window.location.pathname}?r=${room.room_code}`;

  useEffect(() => {
    if (isOpen) {
      QRCode.toDataURL(roomLink, {
        margin: 1,
        width: 240,
        color: {
          dark: '#09090b',
          light: '#ffffff',
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch(() => {});
    }
  }, [isOpen, roomLink]);

  if (!isOpen) return null;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(roomLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(room.room_code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-sm overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center space-x-2">
            <QrCode className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">Share Temporary Room</h3>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 text-center space-y-5">
          <div>
            <h4 className="text-base font-bold text-white">{room.name}</h4>
            <p className="text-xs text-zinc-400 mt-0.5">
              Anyone with this link or code can join with a temporary identity.
            </p>
          </div>

          {/* QR Code */}
          <div className="flex flex-col items-center">
            <div className="p-3 bg-white rounded-xl shadow-lg inline-block border-2 border-zinc-700">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="Room QR Code" className="w-48 h-48" />
              ) : (
                <div className="w-48 h-48 bg-zinc-100 flex items-center justify-center text-zinc-400 text-xs">
                  Generating QR...
                </div>
              )}
            </div>
            <span className="text-[11px] text-zinc-400 mt-2">
              Scan with mobile phone to enter immediately
            </span>
          </div>

          {/* Room Code Badge */}
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-950 border border-zinc-800">
            <div className="text-left">
              <span className="text-[10px] uppercase font-mono text-zinc-400">Room Code</span>
              <div className="font-mono text-base font-bold text-emerald-400">{room.room_code}</div>
            </div>
            <button
              onClick={handleCopyCode}
              className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors flex items-center space-x-1"
            >
              {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCode ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          {/* Direct Link */}
          <div className="space-y-2">
            <button
              onClick={handleCopyLink}
              className="w-full py-2 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs transition-colors flex items-center justify-center space-x-1.5 shadow-sm"
            >
              {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copiedLink ? 'Link Copied to Clipboard!' : 'Copy Invitation Link'}</span>
            </button>

            <a
              href={roomLink}
              target="_blank"
              rel="noreferrer"
              className="w-full py-2 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium text-xs transition-colors flex items-center justify-center space-x-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Open in New Tab (Test Two Users)</span>
            </a>
          </div>

          <div className="pt-1 flex items-center justify-center space-x-1.5 text-[11px] text-zinc-400 font-mono">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Zero personal data or contacts required</span>
          </div>
        </div>
      </div>
    </div>
  );
};
