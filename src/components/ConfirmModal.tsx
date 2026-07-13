import React from 'react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = "LFG (Yes)",
  cancelText = "Abort (No)"
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-950/85 backdrop-blur-md"
        onClick={onCancel}
      />
      
      {/* Modal Box */}
      <div className="relative bg-slate-900 border-4 border-slate-700 p-6 rounded-3xl max-w-md w-full shadow-[8px_8px_0px_0px_rgba(0,0,0,0.5)] transform rotate-[-0.5deg] animate-in scale-in duration-200">
        {/* Cartoon styled badge */}
        <div className="absolute -top-4 -left-3 bg-rose-500 text-slate-950 px-3 py-1 font-display font-extrabold text-xs uppercase border-2 border-slate-950 rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] rotate-[-4deg]">
          🚨 ATTENTION
        </div>

        <div className="space-y-4 mt-2">
          <h3 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
            {title}
          </h3>
          
          <p className="text-sm text-slate-300 font-sans font-medium leading-relaxed bg-slate-950/50 p-3.5 border-2 border-slate-800 rounded-2xl">
            {message}
          </p>

          <div className="flex gap-3 pt-2">
            <button
              onClick={onConfirm}
              className="comic-btn flex-1 bg-emerald-500 hover:bg-emerald-450 text-slate-950 font-display font-extrabold py-3 px-4 rounded-xl text-sm border-2 border-emerald-800 shadow-[4px_4px_0px_0px_#064e3b] hover:translate-y-[-1px] hover:shadow-[5px_5px_0px_0px_#064e3b] active:translate-y-[1px] active:shadow-[2px_2px_0px_0px_#064e3b] transition-all cursor-pointer"
            >
              {confirmText}
            </button>
            <button
              onClick={onCancel}
              className="comic-btn flex-1 bg-slate-800 hover:bg-slate-750 text-slate-200 font-display font-extrabold py-3 px-4 rounded-xl text-sm border-2 border-slate-700 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)] hover:translate-y-[-1px] active:translate-y-[1px] transition-all cursor-pointer"
            >
              {cancelText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
