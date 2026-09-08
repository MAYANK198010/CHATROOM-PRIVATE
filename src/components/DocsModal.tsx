import React, { useState } from 'react';
import { X, BookOpen, Copy, Check, FileText } from 'lucide-react';
import { ENGINEERING_DOCS, EngineeringDoc } from '../data/engineeringDocs';

interface DocsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DocsModal: React.FC<DocsModalProps> = ({ isOpen, onClose }) => {
  const [selectedDoc, setSelectedDoc] = useState<EngineeringDoc>(ENGINEERING_DOCS[0]);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(selectedDoc.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-950 shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">ChatRoom Architecture & Engineering Docs</h2>
              <p className="text-xs text-zinc-400">The 5 foundational specifications defining the platform</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleCopy}
              className="px-2.5 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors flex items-center space-x-1.5"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied Markdown' : 'Copy Doc'}</span>
            </button>
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-white p-1 rounded-md transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Layout: Left Nav + Right Document */}
        <div className="flex-1 flex flex-col sm:flex-row overflow-hidden">
          {/* Sidebar */}
          <div className="w-full sm:w-64 border-b sm:border-b-0 sm:border-r border-zinc-800 bg-zinc-950/70 p-3 space-y-1 overflow-y-auto shrink-0">
            <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 px-2 py-1">
              Foundational Documents
            </div>
            {ENGINEERING_DOCS.map((doc) => (
              <button
                key={doc.id}
                onClick={() => setSelectedDoc(doc)}
                className={`w-full text-left p-2.5 rounded-lg text-xs transition-colors flex items-start space-x-2 ${
                  selectedDoc.id === doc.id
                    ? 'bg-indigo-600/15 border border-indigo-500/40 text-white font-medium'
                    : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
                }`}
              >
                <FileText className="w-4 h-4 mt-0.5 text-indigo-400 shrink-0" />
                <div className="truncate">
                  <div className="font-mono text-[11px] text-zinc-400">{doc.filename}</div>
                  <div className="truncate text-zinc-200 font-semibold">{doc.title}</div>
                </div>
              </button>
            ))}
          </div>

          {/* Document Viewer */}
          <div className="flex-1 p-5 sm:p-8 overflow-y-auto bg-zinc-950 font-mono text-xs leading-relaxed text-zinc-300">
            <pre className="whitespace-pre-wrap font-sans text-xs sm:text-sm text-zinc-200 selection:bg-indigo-500 selection:text-white">
              {selectedDoc.content}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
