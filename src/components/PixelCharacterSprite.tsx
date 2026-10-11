import React, { useState } from 'react';
import { LinkGroup, getGroupColorClasses } from '../types';

interface PixelCharacterSpriteProps {
  symbol: string;
  mint: string;
  change24h: number;
  usdValue: number;
  tileSide?: number;
  diameter?: number;
  size?: number;
  owningGroup?: LinkGroup;
  gColors?: ReturnType<typeof getGroupColorClasses> | null;
  isSelected?: boolean;
  onClick?: () => void;
  logoURI?: string;
  topPercent?: number;
}

export type SpriteArchetype =
  | 'shield'
  | 'crystal'
  | 'tiki'
  | 'wisp'
  | 'golem'
  | 'helm'
  | 'phantom'
  | 'tower'
  | 'oni'
  | 'owl';

// Deterministically map token to sprite archetype
export function getSpriteArchetype(
  symbol: string,
  mint: string,
  color?: string
): SpriteArchetype {
  const symUpper = symbol.toUpperCase();
  if (symUpper === 'SOL') return 'shield';
  if (symUpper === 'USDC' || symUpper === 'USDT') return 'wisp';
  if (symUpper === 'WEN' || symUpper === 'BONK' || symUpper === 'SAMO') return 'tiki';
  if (symUpper === 'JTO' || symUpper === 'PYTH') return 'golem';
  if (symUpper === 'DRIFT' || symUpper === 'MET') return 'oni';
  if (symUpper === 'HYPE' || symUpper === 'ETH') return 'crystal';

  const archetypesByColor: Record<string, SpriteArchetype[]> = {
    violet: ['shield', 'tower', 'golem', 'helm'],
    sky: ['crystal', 'wisp', 'phantom', 'owl'],
    amber: ['tiki', 'helm', 'oni', 'shield'],
    rose: ['oni', 'golem', 'helm', 'wisp'],
    lime: ['tiki', 'crystal', 'tower', 'shield'],
  };

  const pool: SpriteArchetype[] = color && archetypesByColor[color]
    ? archetypesByColor[color]
    : ['shield', 'crystal', 'tiki', 'wisp', 'golem', 'helm', 'phantom', 'tower', 'oni', 'owl'];

  let hash = 0;
  const str = mint + symbol;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % pool.length;
  return pool[index];
}

export default function PixelCharacterSprite({
  symbol,
  mint,
  change24h,
  usdValue,
  tileSide,
  diameter,
  size,
  owningGroup,
  gColors,
  isSelected = false,
  onClick,
  topPercent = 50,
}: PixelCharacterSpriteProps) {
  const [hovered, setHovered] = useState(false);
  const CHAR_PX = 40;
  const currentTileSide = tileSide || size || diameter || 52;

  const DEAD_ZONE = 1.5;
  const isDead = change24h <= -50;
  const isSky = topPercent < 48;
  const isLava = topPercent > 52;
  const isWinner = !isDead && (change24h > DEAD_ZONE || isSky);
  const isLoser = !isDead && (change24h < -DEAD_ZONE || isLava);

  const archetype = getSpriteArchetype(symbol, mint, owningGroup?.color);

  // Single locked 0.42 alpha fill across all tiles
  let primaryColor = '#8b5cf6'; // Violet default
  let gemColor = '#c084fc';
  let tileBgColor = 'rgba(139, 92, 246, 0.42)';

  if (gColors) {
    if (owningGroup?.color === 'violet') {
      primaryColor = '#8b5cf6';
      gemColor = '#c084fc';
      tileBgColor = 'rgba(139, 92, 246, 0.42)';
    } else if (owningGroup?.color === 'amber') {
      primaryColor = '#f59e0b';
      gemColor = '#fbbf24';
      tileBgColor = 'rgba(245, 158, 11, 0.42)';
    } else if (owningGroup?.color === 'sky') {
      primaryColor = '#0284c7';
      gemColor = '#38bdf8';
      tileBgColor = 'rgba(2, 132, 199, 0.42)';
    } else if (owningGroup?.color === 'rose') {
      primaryColor = '#e11d48';
      gemColor = '#fb7185';
      tileBgColor = 'rgba(225, 29, 72, 0.42)';
    } else if (owningGroup?.color === 'lime') {
      primaryColor = '#65a30d';
      gemColor = '#a3e635';
      tileBgColor = 'rgba(101, 163, 13, 0.42)';
    }
  } else {
    // Coins with no basket (no gColors) get a neutral slate tile at 0.42 alpha
    primaryColor = '#475569';
    gemColor = '#94a3b8';
    tileBgColor = 'rgba(71, 85, 105, 0.42)';
  }

  // Apply status recolor to tile border and fill
  if (isDead) {
    primaryColor = '#334155';
    gemColor = '#64748b';
    tileBgColor = 'rgba(51, 65, 85, 0.42)';
  } else if (isLoser && !gColors) {
    primaryColor = '#dc2626';
    gemColor = '#f87171';
    tileBgColor = 'rgba(220, 38, 38, 0.42)';
  }

  // Render archetype SVG
  const renderSpriteSVG = () => {
    switch (archetype) {
      case 'crystal':
        return (
          <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible" shapeRendering="crispEdges">
            {/* Floating Gem Shards */}
            <rect x="15" y="25" width="6" height="12" fill={gemColor} className="animate-pulse" />
            <rect x="78" y="20" width="8" height="14" fill={gemColor} className="animate-pulse" />
            <rect x="82" y="65" width="6" height="10" fill={primaryColor} />
            <rect x="12" y="68" width="8" height="8" fill={primaryColor} />

            {/* Main Crystal Diamond Facets */}
            <polygon points="50,5 82,38 50,95 18,38" fill={primaryColor} stroke="#0f172a" strokeWidth="3" />
            <polygon points="50,5 50,95 82,38" fill="rgba(255,255,255,0.2)" />
            <polygon points="50,5 50,38 82,38" fill="rgba(255,255,255,0.35)" />
            <polygon points="50,5 18,38 50,38" fill="rgba(255,255,255,0.15)" />

            {/* Inner Core Face Container */}
            <rect x="36" y="32" width="28" height="26" rx="4" fill="#0f172a" />

            {/* Eyes */}
            {isDead ? (
              <g fill="#94a3b8">
                <text x="40" y="48" fontSize="12" fontWeight="bold">✕</text>
                <text x="54" y="48" fontSize="12" fontWeight="bold">✕</text>
              </g>
            ) : (
              <g fill="#ffffff">
                <rect x="40" y="38" width="6" height="8" rx="1" />
                <rect x="54" y="38" width="6" height="8" rx="1" />
                <rect x="42" y={isWinner ? "42" : isLoser ? "38" : "40"} width="3" height="4" fill="#0f172a" />
                <rect x="56" y={isWinner ? "42" : isLoser ? "38" : "40"} width="3" height="4" fill="#0f172a" />
              </g>
            )}

            {/* Mouth */}
            {!isDead && (
              isWinner ? (
                <path d="M 42 52 Q 50 57 58 52" stroke="#ffffff" strokeWidth="2.5" fill="none" strokeLinecap="round" />
              ) : isLoser ? (
                <path d="M 42 55 Q 50 50 58 55" stroke="#ffffff" strokeWidth="2.5" fill="none" strokeLinecap="round" />
              ) : (
                <line x1="43" y1="53" x2="57" y2="53" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
              )
            )}
          </svg>
        );

      case 'tiki':
        return (
          <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible" shapeRendering="crispEdges">
            {/* Tiki Stone Block */}
            <rect x="18" y="16" width="64" height="74" rx="6" fill="#1e1b18" stroke="#000000" strokeWidth="4" />
            <rect x="22" y="20" width="56" height="66" rx="4" fill="#2d2620" />

            {/* Golden Forehead Gem */}
            <polygon points="50,8 60,22 50,34 40,22" fill={gemColor} stroke="#000" strokeWidth="2" />
            <polygon points="50,8 50,34 60,22" fill="rgba(255,255,255,0.4)" />

            {/* Carved Eyebrows */}
            <rect x="26" y="36" width="22" height="6" fill="#1e1b18" />
            <rect x="52" y="36" width="22" height="6" fill="#1e1b18" />

            {/* Eye Sockets */}
            <rect x="28" y="44" width="18" height="16" fill="#000000" />
            <rect x="54" y="44" width="18" height="16" fill="#000000" />

            {/* Glowing Eyes */}
            {isDead ? (
              <g fill="#64748b" fontWeight="bold" fontSize="12">
                <text x="31" y="56">✕</text>
                <text x="57" y="56">✕</text>
              </g>
            ) : (
              <g fill={gemColor}>
                <rect x="32" y="48" width="10" height="8" rx="1" />
                <rect x="58" y="48" width="10" height="8" rx="1" />
                <rect x="34" y="50" width="4" height="4" fill="#ffffff" />
                <rect x="60" y="50" width="4" height="4" fill="#ffffff" />
              </g>
            )}

            {/* Fiery Tiki Mouth */}
            <rect x="30" y="68" width="40" height="14" fill="#000000" rx="2" />
            {!isDead && (
              <g fill={primaryColor}>
                <rect x="34" y="70" width="6" height="4" fill="#ffffff" />
                <rect x="44" y="70" width="6" height="4" fill="#ffffff" />
                <rect x="54" y="70" width="6" height="4" fill="#ffffff" />
                <rect x="60" y="70" width="6" height="4" fill="#ffffff" />
                <path d="M 32 76 Q 50 84 68 76" stroke={gemColor} strokeWidth="3" fill="none" />
              </g>
            )}

            {/* Ember Base Flames */}
            <circle cx="25" cy="88" r="4" fill="#f59e0b" className="animate-pulse" />
            <circle cx="75" cy="88" r="4" fill="#ef4444" className="animate-pulse" />
          </svg>
        );

      case 'wisp':
        return (
          <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
            {/* Spirit Wisp Outer Aura */}
            <path
              d="M 50 5 C 20 30 15 65 30 85 C 45 100 55 100 70 85 C 85 65 80 30 50 5 Z"
              fill={primaryColor}
              opacity="0.85"
              stroke="#0f172a"
              strokeWidth="3"
            />
            {/* Flame Inner Core */}
            <path
              d="M 50 18 C 30 38 28 62 38 78 C 48 90 52 90 62 78 C 72 62 70 38 50 18 Z"
              fill={gemColor}
            />

            {/* Dark Mask Center */}
            <ellipse cx="50" cy="58" rx="20" ry="16" fill="#090d16" />

            {/* Eyes */}
            {isDead ? (
              <g fill="#64748b" fontWeight="bold" fontSize="12">
                <text x="38" y="62">✕</text>
                <text x="54" y="62">✕</text>
              </g>
            ) : (
              <g fill="#ffffff">
                <ellipse cx="42" cy="56" rx="4" ry="6" />
                <ellipse cx="58" cy="56" rx="4" ry="6" />
                <circle cx="42" cy={isWinner ? "58" : "54"} r="2" fill="#090d16" />
                <circle cx="58" cy={isWinner ? "58" : "54"} r="2" fill="#090d16" />
              </g>
            )}

            {/* Flame Tail Sparkles */}
            <circle cx="20" cy="25" r="3" fill={gemColor} className="animate-ping" />
            <circle cx="80" cy="30" r="2.5" fill={gemColor} className="animate-ping" />
          </svg>
        );

      case 'golem':
        return (
          <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible" shapeRendering="crispEdges">
            {/* Obsidian Rock Body */}
            <polygon points="12,25 88,25 94,82 6,82" fill="#1c1917" stroke="#000000" strokeWidth="4" />
            <polygon points="16,28 84,28 89,78 11,78" fill="#292524" />

            {/* Fiery Crest Gem */}
            <polygon points="50,5 62,25 50,32 38,25" fill={gemColor} stroke="#000" strokeWidth="2" />

            {/* Frowning Rock Brow */}
            <polygon points="18,36 50,44 82,36 82,42 50,50 18,42" fill="#1c1917" />

            {/* Glowing Eye Socket Slots */}
            <rect x="24" y="48" width="20" height="12" fill="#000" />
            <rect x="56" y="48" width="20" height="12" fill="#000" />

            {isDead ? (
              <g fill="#64748b" fontSize="12" fontWeight="bold">
                <text x="28" y="58">✕</text>
                <text x="60" y="58">✕</text>
              </g>
            ) : (
              <g fill={gemColor}>
                <rect x="28" y="51" width="12" height="6" />
                <rect x="60" y="51" width="12" height="6" />
              </g>
            )}

            {/* Frowning Rock Jaw */}
            <path d="M 30 72 L 50 64 L 70 72" stroke="#000" strokeWidth="4" fill="none" strokeLinecap="square" />
            <path d="M 30 72 L 50 64 L 70 72" stroke={primaryColor} strokeWidth="2" fill="none" strokeLinecap="square" />
          </svg>
        );

      case 'helm':
        return (
          <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
            {/* Horns */}
            <path d="M 22 35 C 5 25 0 5 15 5 C 22 18 25 25 28 32 Z" fill="#334155" stroke="#0f172a" strokeWidth="2" />
            <path d="M 78 35 C 95 25 100 5 85 5 C 78 18 75 25 72 32 Z" fill="#334155" stroke="#0f172a" strokeWidth="2" />

            {/* Main Iron Helmet */}
            <rect x="20" y="25" width="60" height="65" rx="10" fill="#1e293b" stroke="#0f172a" strokeWidth="4" />
            <rect x="24" y="29" width="52" height="57" rx="8" fill="#334155" />

            {/* Gold Forehead Gem */}
            <polygon points="50,15 60,28 50,38 40,28" fill={gemColor} stroke="#0f172a" strokeWidth="2" />

            {/* Dark Visor Slit */}
            <rect x="26" y="44" width="48" height="20" rx="4" fill="#020617" />

            {/* Eyes inside Visor */}
            {isDead ? (
              <g fill="#64748b" fontSize="12" fontWeight="bold">
                <text x="32" y="58">✕</text>
                <text x="56" y="58">✕</text>
              </g>
            ) : (
              <g fill={gemColor}>
                <rect x="32" y="50" width="10" height="8" rx="2" />
                <rect x="58" y="50" width="10" height="8" rx="2" />
                <rect x="35" y="52" width="4" height="4" fill="#ffffff" />
                <rect x="61" y="52" width="4" height="4" fill="#ffffff" />
              </g>
            )}

            {/* Mouth Grille */}
            <line x1="36" y1="74" x2="64" y2="74" stroke="#0f172a" strokeWidth="3" strokeLinecap="round" />
            <line x1="42" y1="70" x2="42" y2="78" stroke="#0f172a" strokeWidth="2" />
            <line x1="50" y1="70" x2="50" y2="78" stroke="#0f172a" strokeWidth="2" />
            <line x1="58" y1="70" x2="58" y2="78" stroke="#0f172a" strokeWidth="2" />
          </svg>
        );

      case 'phantom':
        return (
          <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
            {/* Hood Cowl */}
            <path
              d="M 50 8 C 22 8 16 35 16 65 C 16 88 35 95 50 95 C 65 95 84 88 84 65 C 84 35 78 8 50 8 Z"
              fill="#0f172a"
              stroke="#020617"
              strokeWidth="4"
            />
            {/* Inner Hood Darkness */}
            <path
              d="M 50 18 C 28 18 24 40 24 65 C 24 82 38 86 50 86 C 62 86 76 82 76 65 C 76 40 72 18 50 18 Z"
              fill="#020617"
            />

            {/* Floating Cyan/Blue Eyes */}
            {isDead ? (
              <g fill="#64748b" fontSize="12" fontWeight="bold">
                <text x="35" y="55">✕</text>
                <text x="55" y="55">✕</text>
              </g>
            ) : (
              <g fill={gemColor}>
                <polygon points="32,48 44,45 40,58 30,55" />
                <polygon points="68,48 56,45 60,58 70,55" />
                <circle cx="37" cy="50" r="2" fill="#ffffff" />
                <circle cx="63" cy="50" r="2" fill="#ffffff" />
              </g>
            )}
          </svg>
        );

      case 'tower':
        return (
          <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible" shapeRendering="crispEdges">
            {/* Castle Tower Body */}
            <rect x="22" y="22" width="56" height="70" fill="#1e293b" stroke="#000" strokeWidth="4" />

            {/* Crenellations (Tower Top) */}
            <rect x="18" y="10" width="16" height="16" fill="#334155" stroke="#000" strokeWidth="2" />
            <rect x="42" y="10" width="16" height="16" fill="#334155" stroke="#000" strokeWidth="2" />
            <rect x="66" y="10" width="16" height="16" fill="#334155" stroke="#000" strokeWidth="2" />

            {/* Diamond Crest */}
            <polygon points="50,28 58,38 50,48 42,38" fill={gemColor} stroke="#000" strokeWidth="2" />

            {/* Tower Window Eyes */}
            <rect x="30" y="52" width="14" height="16" fill="#000" rx="2" />
            <rect x="56" y="52" width="14" height="16" fill="#000" rx="2" />

            {isDead ? (
              <g fill="#64748b" fontSize="12" fontWeight="bold">
                <text x="32" y="64">✕</text>
                <text x="58" y="64">✕</text>
              </g>
            ) : (
              <g fill={primaryColor}>
                <rect x="33" y="55" width="8" height="10" fill={gemColor} />
                <rect x="59" y="55" width="8" height="10" fill={gemColor} />
              </g>
            )}

            {/* Gate Mouth */}
            <path d="M 40 92 L 40 76 Q 50 70 60 76 L 60 92 Z" fill="#000" />
          </svg>
        );

      case 'oni':
        return (
          <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
            {/* Oni Horns */}
            <path d="M 30 28 Q 15 10 5 0 Q 15 20 25 35 Z" fill="#f59e0b" stroke="#000" strokeWidth="2" />
            <path d="M 70 28 Q 85 10 95 0 Q 85 20 75 35 Z" fill="#f59e0b" stroke="#000" strokeWidth="2" />

            {/* Mask Face */}
            <path
              d="M 22 25 L 78 25 L 84 65 L 50 92 L 16 65 Z"
              fill={primaryColor}
              stroke="#0f172a"
              strokeWidth="4"
            />

            {/* Gold Crest */}
            <polygon points="50,15 60,28 50,38 40,28" fill={gemColor} stroke="#000" strokeWidth="2" />

            {/* Eye Sockets */}
            <polygon points="26,42 46,45 42,56 24,52" fill="#000000" />
            <polygon points="74,42 54,45 58,56 76,52" fill="#000000" />

            {isDead ? (
              <g fill="#64748b" fontSize="12" fontWeight="bold">
                <text x="30" y="52">✕</text>
                <text x="60" y="52">✕</text>
              </g>
            ) : (
              <g fill="#ffffff">
                <circle cx="35" cy="48" r="4" />
                <circle cx="65" cy="48" r="4" />
                <circle cx="35" cy="48" r="2" fill="#000" />
                <circle cx="65" cy="48" r="2" fill="#000" />
              </g>
            )}

            {/* Sharp Fangs Mouth */}
            <rect x="32" y="68" width="36" height="12" rx="2" fill="#000000" />
            <polygon points="36,68 40,75 44,68" fill="#ffffff" />
            <polygon points="56,68 60,75 64,68" fill="#ffffff" />
          </svg>
        );

      case 'owl':
      default:
        return (
          <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
            {/* Celestial Owl Wings/Head Mask */}
            <path
              d="M 50 10 C 20 10 12 35 12 60 C 12 82 32 92 50 92 C 68 92 88 82 88 60 C 88 35 80 10 50 10 Z"
              fill="#0f172a"
              stroke="#020617"
              strokeWidth="4"
            />
            <path
              d="M 50 16 C 25 16 18 38 18 60 C 18 78 34 86 50 86 C 66 86 82 78 82 60 C 82 38 75 16 50 16 Z"
              fill="#1e293b"
            />

            {/* Beak */}
            <polygon points="50,54 58,68 50,78 42,68" fill="#f59e0b" stroke="#0f172a" strokeWidth="2" />

            {/* Large Owl Eye Rings */}
            <circle cx="32" cy="45" r="14" fill="#020617" stroke={gemColor} strokeWidth="3" />
            <circle cx="68" cy="45" r="14" fill="#020617" stroke={gemColor} strokeWidth="3" />

            {isDead ? (
              <g fill="#64748b" fontSize="12" fontWeight="bold">
                <text x="26" y="50">✕</text>
                <text x="62" y="50">✕</text>
              </g>
            ) : (
              <g fill="#ffffff">
                <circle cx="32" cy="45" r="6" />
                <circle cx="68" cy="45" r="6" />
                <circle cx="32" cy={isWinner ? "47" : "43"} r="3" fill="#020617" />
                <circle cx="68" cy={isWinner ? "47" : "43"} r="3" fill="#020617" />
              </g>
            )}
          </svg>
        );
    }
  };

  // Group name or Basket Label
  const basketLabel = owningGroup ? owningGroup.name : 'UNLINKED';

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: `${currentTileSide}px`,
        height: `${currentTileSide}px`,
      }}
      className={`relative cursor-pointer transition-all duration-300 flex items-center justify-center ${
        isWinner ? 'animate-winner-bob' : isLoser ? 'animate-loser-wobble' : ''
      }`}
    >
      {/* LOCKED PIXEL-SQUARE BASKET COLOR TILE (BLOCK STYLE) */}
      <div
        style={{
          borderColor: primaryColor,
          backgroundColor: tileBgColor,
          boxShadow: isSelected
            ? `0 0 8px ${primaryColor}`
            : '0 0 6px rgba(0, 0, 0, 0.35)',
        }}
        className={`absolute inset-0 rounded-none border-2 transition-all duration-200 pointer-events-none ${
          isSelected
            ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-950 z-10'
            : hovered
            ? 'brightness-125 z-10'
            : 'z-0'
        }`}
      />

      {/* TOP COIN SYMBOL PILL BADGE (BASKET COLOR-CODED) */}
      <div
        style={{
          borderColor: primaryColor,
        }}
        className={`absolute -top-4.5 left-1/2 -translate-x-1/2 text-[9px] font-mono font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border shadow-xl flex items-center gap-1 z-30 whitespace-nowrap backdrop-blur-md ${
          gColors ? `${gColors.bgSolid} text-white` : 'bg-slate-900/90 text-slate-200 border-slate-700'
        }`}
        title={`Token: ${symbol} | Basket: ${basketLabel}`}
      >
        <span
          style={{ backgroundColor: gemColor }}
          className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0"
        />
        <span className="truncate max-w-[75px]">{symbol}</span>
      </div>

      {/* WINNER WINGS IN SKY */}
      {isWinner && (
        <>
          <div className="absolute top-1/2 -left-4 -translate-y-1/2 pointer-events-none z-0 animate-wing-flap-left">
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-indigo-300 fill-indigo-300/90 drop-shadow-[0_0_8px_rgba(168,85,247,0.9)]">
              <path d="M22 12C15 12 10 6 2 2C6 10 10 16 22 12Z" />
            </svg>
          </div>
          <div className="absolute top-1/2 -right-4 -translate-y-1/2 pointer-events-none z-0 animate-wing-flap-right">
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-indigo-300 fill-indigo-300/90 drop-shadow-[0_0_8px_rgba(168,85,247,0.9)]">
              <path d="M2 12C9 12 14 6 2 2C18 10 14 16 2 12Z" />
            </svg>
          </div>
        </>
      )}

      {/* FLAME EMBER UNDERGLOW FOR LOSERS IN LAVA */}
      {isLoser && (
        <div className="absolute -bottom-3 inset-x-0 flex justify-center gap-0.5 pointer-events-none z-20 animate-bounce">
          <span className="text-[10px]">🔥</span>
        </div>
      )}

      {/* MAIN SPRITE SVG CONTAINER AT CONSTANT SIZE */}
      <div
        style={{
          width: `${CHAR_PX}px`,
          height: `${CHAR_PX}px`,
        }}
        className="relative z-10 flex items-center justify-center select-none pointer-events-none shrink-0"
      >
        {renderSpriteSVG()}
      </div>

      {/* BOTTOM CAPSULE PILL: CLEAN 24H % + USD VALUE (SHOWN ONLY ON HOVER OR SELECTED) */}
      {(isSelected || hovered) && (
        <div className="absolute -bottom-5.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-slate-950/95 border border-slate-700/90 px-2 py-0.5 rounded-full shadow-2xl z-30 pointer-events-none whitespace-nowrap backdrop-blur-md">
          <span
            className={`text-[8px] font-mono font-bold px-1.5 py-0.2 rounded-full ${
              change24h >= 0
                ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-500/40'
                : 'bg-rose-950/90 text-rose-300 border border-rose-500/40'
            }`}
          >
            {change24h >= 0 ? '+' : ''}{change24h.toFixed(1)}%
          </span>
          <span className="text-[8px] font-mono text-slate-200 font-bold">
            ${usdValue >= 1000 ? `${(usdValue / 1000).toFixed(1)}k` : usdValue.toFixed(0)}
          </span>
        </div>
      )}
    </div>
  );
}
