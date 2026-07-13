import React, { useState, useEffect } from 'react';

interface TokenLogoProps {
  logoURI?: string;
  symbol: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export default function TokenLogo({ logoURI, symbol, size = 'md' }: TokenLogoProps) {
  const [error, setError] = useState(false);

  // Reset error state when logoURI changes
  useEffect(() => {
    setError(false);
  }, [logoURI]);

  const sizeClasses = {
    sm: 'w-6 h-6 text-[10px]',
    md: 'w-7 h-7 text-xs',
    lg: 'w-10 h-10 text-sm',
    xl: 'w-12 h-12 text-base',
  };

  const selectedSize = sizeClasses[size] || sizeClasses.md;

  if (!logoURI || error) {
    // Generate a consistent dark background color based on the symbol string
    const getBgColor = (str: string) => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
      }
      const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
      const hex = '00000'.substring(0, 6 - c.length) + c;
      return `#${hex}22`; // Add 22 for transparency (soft bg)
    };

    const getTextColor = (str: string) => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
      }
      const colors = ['text-emerald-400', 'text-sky-400', 'text-indigo-400', 'text-amber-400', 'text-pink-400', 'text-violet-400'];
      return colors[Math.abs(hash) % colors.length];
    };

    const bg = getBgColor(symbol);
    const textColorClass = getTextColor(symbol);

    return (
      <div
        className={`${selectedSize} rounded-full flex items-center justify-center font-bold border border-slate-800 uppercase tracking-wider ${textColorClass} flex-shrink-0`}
        style={{ backgroundColor: bg }}
      >
        {symbol.slice(0, 2)}
      </div>
    );
  }

  return (
    <img
      src={logoURI}
      alt={symbol}
      className={`${selectedSize} rounded-full object-cover border border-slate-800 flex-shrink-0`}
      referrerPolicy="no-referrer"
      onError={() => setError(true)}
    />
  );
}
