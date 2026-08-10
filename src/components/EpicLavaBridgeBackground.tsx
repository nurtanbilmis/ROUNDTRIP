import React from 'react';

interface EpicLavaBridgeBackgroundProps {
  maxAbsChange: number;
}

export default function EpicLavaBridgeBackground({ maxAbsChange }: EpicLavaBridgeBackgroundProps) {
  const isErupting = maxAbsChange > 20;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden select-none">
      {/* 1. TOP HALF: COSMIC STARRY SKY, SUNSET HORIZON & MOUNTAINS */}
      <div className="absolute inset-x-0 top-0 h-[52%] overflow-hidden bg-slate-950">
        {/* Cosmic Nebula Glows */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-900/50 via-purple-950/40 to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-blue-900/40 via-sky-950/30 to-transparent" />
        
        {/* Sunset Horizon Flare */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[80%] h-36 bg-gradient-to-t from-amber-500/40 via-purple-900/30 to-transparent blur-xl" />
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-48 h-20 bg-amber-300/50 blur-2xl rounded-full" />

        {/* Celestial Starfield SVG */}
        <svg className="absolute inset-0 w-full h-full opacity-80" viewBox="0 0 1000 300" preserveAspectRatio="none">
          <g fill="#ffffff">
            <circle cx="50" cy="30" r="1" opacity="0.8" />
            <circle cx="120" cy="80" r="1.5" opacity="0.9" />
            <circle cx="200" cy="20" r="1" opacity="0.6" />
            <circle cx="280" cy="60" r="2" opacity="0.9" />
            <circle cx="340" cy="15" r="1" opacity="0.7" />
            <circle cx="420" cy="70" r="1.5" opacity="0.8" />
            <circle cx="510" cy="25" r="1" opacity="0.9" />
            <circle cx="600" cy="55" r="2" opacity="0.9" />
            <circle cx="680" cy="18" r="1" opacity="0.6" />
            <circle cx="770" cy="65" r="1.5" opacity="0.8" />
            <circle cx="850" cy="30" r="1" opacity="0.7" />
            <circle cx="930" cy="75" r="2" opacity="0.9" />
            {/* Additional fine twinkling stars */}
            <circle cx="90" cy="110" r="0.8" opacity="0.5" />
            <circle cx="230" cy="100" r="0.8" opacity="0.6" />
            <circle cx="390" cy="115" r="1.2" opacity="0.7" />
            <circle cx="640" cy="95" r="0.8" opacity="0.5" />
            <circle cx="810" cy="105" r="1.2" opacity="0.8" />
          </g>
          {/* Nebula Clouds SVG paths */}
          <path d="M 0 0 Q 300 120 600 20 T 1000 0 L 1000 150 L 0 150 Z" fill="url(#nebulaGrad)" opacity="0.35" />
          <defs>
            <linearGradient id="nebulaGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.6" />
              <stop offset="50%" stopColor="#9333ea" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#0284c7" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>

        {/* Snow-Capped Mountain Range Silhouette */}
        <svg className="absolute bottom-0 inset-x-0 w-full h-36 overflow-visible" viewBox="0 0 1000 150" preserveAspectRatio="none">
          <defs>
            <linearGradient id="mountainGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#1e1b4b" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#090d16" stopOpacity="1" />
            </linearGradient>
            <linearGradient id="snowGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#e0e7ff" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#818cf8" stopOpacity="0.3" />
            </linearGradient>
          </defs>

          {/* Far Distant Mountain Peaks */}
          <path
            d="M 0 150 L 0 90 L 60 40 L 110 80 L 170 30 L 240 100 L 320 20 L 400 85 L 480 15 L 540 70 L 620 25 L 710 90 L 800 35 L 880 75 L 940 30 L 1000 80 L 1000 150 Z"
            fill="url(#mountainGrad)"
          />

          {/* Snow Caps Highlights on Peaks */}
          {/* Peak 1: x=170, y=30 */}
          <path d="M 170 30 L 155 50 L 170 45 L 185 52 Z" fill="url(#snowGrad)" />
          {/* Peak 2: x=320, y=20 */}
          <path d="M 320 20 L 300 45 L 320 40 L 340 48 Z" fill="url(#snowGrad)" />
          {/* Peak 3: x=480, y=15 (Sun Center Peak) */}
          <path d="M 480 15 L 455 45 L 480 38 L 505 48 Z" fill="url(#snowGrad)" />
          {/* Peak 4: x=620, y=25 */}
          <path d="M 620 25 L 600 50 L 620 45 L 640 52 Z" fill="url(#snowGrad)" />
          {/* Peak 5: x=800, y=35 */}
          <path d="M 800 35 L 780 60 L 800 52 L 820 62 Z" fill="url(#snowGrad)" />

          {/* Nearer Dark Ridge Overlay */}
          <path
            d="M 0 150 L 0 110 L 80 85 L 150 120 L 220 75 L 350 130 L 450 65 L 560 125 L 680 70 L 780 115 L 890 65 L 1000 105 L 1000 150 Z"
            fill="#090d16"
          />
        </svg>
      </div>

      {/* 2. BOTTOM HALF: VOLCANIC LAVA CANYON CHASM */}
      <div className="absolute inset-x-0 bottom-0 h-[48%] overflow-hidden bg-[#0a0505]">
        {/* Fiery Deep Ambient Heat Glow */}
        <div className="absolute inset-0 bg-gradient-to-t from-red-600/40 via-orange-600/25 to-transparent" />
        
        {/* Molten Lava Floor and River Pathways SVG */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1000 280" preserveAspectRatio="none">
          <defs>
            <linearGradient id="lavaStreamGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ff1744" />
              <stop offset="50%" stopColor="#ff6d00" />
              <stop offset="100%" stopColor="#ffd600" />
            </linearGradient>

            <linearGradient id="lavaFallGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ff5252" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#ffab00" stopOpacity="0.4" />
            </linearGradient>

            <filter id="lavaGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Main Glowing Lava River Bed (Bottom Floor) */}
          <path
            d="M 0 280 L 0 210 Q 150 180 250 220 T 500 200 T 750 230 T 1000 190 L 1000 280 Z"
            fill="url(#lavaStreamGrad)"
            filter="url(#lavaGlow)"
          />

          {/* Secondary Feeder Lava Streams */}
          <path
            d="M 120 120 Q 180 160 220 220"
            stroke="#ff3d00"
            strokeWidth="14"
            fill="none"
            filter="url(#lavaGlow)"
            strokeLinecap="round"
          />
          <path
            d="M 880 110 Q 820 160 780 230"
            stroke="#ff3d00"
            strokeWidth="12"
            fill="none"
            filter="url(#lavaGlow)"
            strokeLinecap="round"
          />

          {/* Vertical Lava Waterfalls along Rock Walls */}
          <rect x="95" y="80" width="6" height="110" rx="3" fill="url(#lavaFallGrad)" filter="url(#lavaGlow)" />
          <rect x="915" y="70" width="8" height="120" rx="4" fill="url(#lavaFallGrad)" filter="url(#lavaGlow)" />

          {/* Dark Jagged Volcanic Rock Cliff Overlays on Left & Right */}
          {/* Left Cliff Side */}
          <path
            d="M 0 0 L 160 0 L 130 60 L 180 120 L 110 180 L 150 280 L 0 280 Z"
            fill="#120c0c"
          />
          {/* Left Cliff Rock Shading & Cracks */}
          <path d="M 0 0 L 160 0 L 130 60 L 180 120 L 110 180 L 150 280" stroke="#2a1a1a" strokeWidth="4" fill="none" />
          <path d="M 50 30 L 110 80 M 30 110 L 90 150" stroke="#ff3d00" strokeWidth="1.5" strokeDasharray="4 2" opacity="0.8" fill="none" />

          {/* Right Cliff Side */}
          <path
            d="M 1000 0 L 840 0 L 870 70 L 820 130 L 890 190 L 850 280 L 1000 280 Z"
            fill="#120c0c"
          />
          {/* Right Cliff Rock Shading & Cracks */}
          <path d="M 1000 0 L 840 0 L 870 70 L 820 130 L 890 190 L 850 280" stroke="#2a1a1a" strokeWidth="4" fill="none" />
          <path d="M 950 40 L 880 90 M 970 120 L 910 170" stroke="#ff3d00" strokeWidth="1.5" strokeDasharray="4 2" opacity="0.8" fill="none" />
        </svg>

        {/* Rising Magma Blobs & Embers */}
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(12)].map((_, i) => (
            <div
              key={`magma-${i}`}
              style={{
                left: `${10 + i * 7.5}%`,
                animationDelay: `${(i * 0.4) % 3}s`,
                animationDuration: `${2.5 + (i % 3) * 0.7}s`,
              }}
              className="absolute bottom-0 w-3 h-3 rounded-full bg-gradient-to-t from-orange-600 via-amber-400 to-yellow-200 blur-xs opacity-80 animate-lava-rise"
            />
          ))}

          {[...Array(10)].map((_, i) => (
            <div
              key={`ember-flicker-${i}`}
              style={{
                left: `${15 + i * 8}%`,
                animationDelay: `${(i * 0.3) % 2.5}s`,
                animationDuration: `${2 + (i % 2) * 0.8}s`,
              }}
              className="absolute bottom-2 w-1.5 h-1.5 rounded-full bg-amber-300 shadow-[0_0_8px_#f59e0b] animate-ember-fly"
            />
          ))}
        </div>
      </div>

      {/* 3. CENTER HEAVY ANCIENT STONE ARCH BRIDGE (At 50% Parity Axis) */}
      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
        <svg className="w-full h-16 overflow-visible" viewBox="0 0 1000 64" preserveAspectRatio="none">
          <defs>
            {/* Pattern for Stone Masonry / Stone Brick Texture */}
            <pattern id="stoneMasonry" width="20" height="12" patternUnits="userSpaceOnUse">
              <rect width="20" height="12" fill="#1c1917" />
              <rect x="0" y="0" width="19" height="5" fill="#292524" rx="0.5" />
              <rect x="10" y="6" width="19" height="5" fill="#292524" rx="0.5" />
              <line x1="0" y1="0" x2="20" y2="0" stroke="#0c0a09" strokeWidth="1" />
              <line x1="0" y1="6" x2="20" y2="6" stroke="#0c0a09" strokeWidth="1" />
              <line x1="19" y1="0" x2="19" y2="6" stroke="#0c0a09" strokeWidth="1" />
              <line x1="9" y1="6" x2="9" y2="12" stroke="#0c0a09" strokeWidth="1" />
            </pattern>

            {/* Linear Gradient for Bridge Arch Depth & Fiery Underglow */}
            <linearGradient id="bridgeUnderglow" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#292524" />
              <stop offset="60%" stopColor="#1c1917" />
              <stop offset="100%" stopColor="#7c2d12" />
            </linearGradient>

            <filter id="stoneShadow" x="-5%" y="-5%" width="110%" height="120%">
              <feDropShadow dx="0" dy="6" stdDeviation="4" floodColor="#000000" floodOpacity="0.8" />
            </filter>
          </defs>

          {/* Heavy Stone Bridge Arch Structure */}
          {/* Main Solid Bridge Deck Path with Wide Under-Arch Curve */}
          <path
            d="M 0 16 L 1000 16 L 1000 48 L 920 48 Q 500 24 80 48 L 0 48 Z"
            fill="url(#stoneMasonry)"
            filter="url(#stoneShadow)"
          />

          {/* Under-Arch Beveled Edge & Lava Underglow Reflection */}
          <path
            d="M 0 48 L 80 48 Q 500 24 920 48 L 1000 48 L 1000 52 L 920 52 Q 500 28 80 52 L 0 52 Z"
            fill="url(#bridgeUnderglow)"
          />

          {/* Top Stone Balustrade / Parapet Railing */}
          <rect x="0" y="8" width="1000" height="8" fill="#292524" stroke="#44403c" strokeWidth="1" />
          {/* Individual Stone Posts along Balustrade */}
          {[...Array(50)].map((_, i) => (
            <rect
              key={`post-${i}`}
              x={i * 20}
              y="4"
              width="6"
              height="12"
              rx="1"
              fill="#382e2b"
              stroke="#1c1917"
              strokeWidth="0.8"
            />
          ))}

          {/* Top Walkway Line Highlight */}
          <line x1="0" y1="16" x2="1000" y2="16" stroke="#78716c" strokeWidth="1.5" />
        </svg>

        {/* Parity Badge anchored on the stone bridge deck */}
        <div className="absolute left-4 top-1/2 -translate-y-1/2 bg-stone-900/95 border border-amber-600/80 text-amber-200 text-[10px] font-mono font-bold uppercase tracking-widest px-2.5 py-1 rounded-md shadow-2xl z-20 flex items-center gap-1.5 backdrop-blur-md">
          <span>🌉</span>
          <span>0.0% PARITY</span>
        </div>
      </div>
    </div>
  );
}
