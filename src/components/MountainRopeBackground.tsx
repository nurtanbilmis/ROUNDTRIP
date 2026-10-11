import React from 'react';

interface MountainRopeBackgroundProps {
  maxAbsChange: number;
}

export default function MountainRopeBackground({ maxAbsChange }: MountainRopeBackgroundProps) {
  // maxAbsChange drives subtle summit tinting
  const isHighVol = maxAbsChange > 20;
  const isMidVol = maxAbsChange >= 5;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden select-none">
      {/* 1. LIGHTENED VERTICAL GRADIENT: VISIBLE ALPINE BLUE-GREY DAWN TO LIT SLOPE TO COOL SHADOW */}
      <div
        className="absolute inset-0 transition-colors duration-700"
        style={{
          background: isHighVol
            ? 'linear-gradient(180deg, #37445a 0%, #2a3446 25%, #1e2533 55%, #141923 80%, #0d1017 100%)'
            : isMidVol
            ? 'linear-gradient(180deg, #3d4a63 0%, #2f3a4e 25%, #222a3a 55%, #171d28 80%, #0f131c 100%)'
            : 'linear-gradient(180deg, #44536e 0%, #344158 25%, #263042 55%, #1a2230 80%, #111622 100%)',
        }}
      />

      {/* Soft dawn-amber rim at the summit top */}
      <div
        className="absolute top-0 inset-x-0 h-28 opacity-80"
        style={{
          background: isHighVol
            ? 'linear-gradient(180deg, rgba(203, 213, 225, 0.12) 0%, transparent 100%)'
            : 'linear-gradient(180deg, rgba(251, 191, 36, 0.14) 0%, rgba(217, 119, 6, 0.05) 45%, transparent 100%)',
        }}
      />

      {/* 2. 3 MOUNTAIN RIDGE SILHOUETTE LAYERS (PALEST/HIGHEST IN BACK, DARKER/LOWER IN FRONT) */}
      <svg
        className="absolute inset-x-0 bottom-0 w-full h-[75%] overflow-visible"
        viewBox="0 0 1000 450"
        preserveAspectRatio="none"
      >
        <defs>
          {/* Layer 1: High distant alpine peaks (palest) */}
          <linearGradient id="ridgeFarGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#64748b" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#334155" stopOpacity="0.95" />
          </linearGradient>

          {/* Layer 2: Mid-range mountain massifs */}
          <linearGradient id="ridgeMidGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#475569" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#1e293b" stopOpacity="0.98" />
          </linearGradient>

          {/* Layer 3: Foreground crags & lower slopes (darkest) */}
          <linearGradient id="ridgeCloseGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#293548" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#0f172a" stopOpacity="1" />
          </linearGradient>
        </defs>

        {/* 1. Distant High Peaks (Pale, high jagged summits) */}
        <polygon
          points="0,450 0,130 90,80 180,140 280,60 390,130 490,50 590,120 700,45 810,125 910,70 1000,120 1000,450"
          fill="url(#ridgeFarGrad)"
        />

        {/* 2. Mid Mountain Ridge (Interlocking shoulders) */}
        <polygon
          points="0,450 0,190 120,135 240,210 360,125 480,195 620,115 740,185 860,130 960,190 1000,165 1000,450"
          fill="url(#ridgeMidGrad)"
        />

        {/* 3. Near Slopes & Crags (Dark, prominent ridges) */}
        <polygon
          points="0,450 0,260 150,200 290,270 430,190 570,250 710,175 840,240 950,195 1000,230 1000,450"
          fill="url(#ridgeCloseGrad)"
        />
      </svg>

      {/* Subtle slope mist overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-25">
        <div className="absolute top-1/4 left-1/4 w-72 h-24 bg-slate-300/10 rounded-full blur-3xl" />
        <div className="absolute top-3/5 right-1/5 w-96 h-28 bg-slate-400/10 rounded-full blur-3xl" />
      </div>

      {/* 3. PARITY RIDGE LEDGE ACROSS 50% */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
        {/* Thin Rock Shelf Line */}
        <div className="w-full h-[1px] bg-slate-500/70" />
        <div className="w-full h-[1px] bg-slate-900/90 shadow-[0_1px_3px_rgba(0,0,0,0.8)]" />

        {/* Parity Ledge Left-Side Badge */}
        <div className="absolute left-4 top-1/2 -translate-y-1/2 bg-slate-900/95 border border-slate-600/80 text-slate-200 text-[10px] font-mono font-bold uppercase tracking-widest px-2.5 py-0.5 rounded shadow-lg z-20 flex items-center gap-1.5 backdrop-blur-md">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
          <span>0.0% RIDGE LINE</span>
        </div>
      </div>
    </div>
  );
}
