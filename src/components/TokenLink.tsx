import React from 'react';
import { ExternalLink } from 'lucide-react';
import { useTokenViewer, tokenViewerUrl } from '../tokenViewer';

export interface TokenLinkProps {
  mint: string;
  children: React.ReactNode;
  className?: string;
  showIcon?: boolean;
}

export default function TokenLink({
  mint,
  children,
  className = '',
  showIcon = false,
}: TokenLinkProps) {
  const [viewer] = useTokenViewer();
  const url = tokenViewerUrl(mint, viewer);
  const title = viewer === 'jupiter' ? 'View on Jupiter' : 'View on DexScreener';

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
      }}
      className={`group/tokenlink inline-flex items-center gap-1.5 cursor-pointer hover:underline text-inherit ${className}`}
    >
      {children}
      {showIcon && (
        <ExternalLink className="w-3 h-3 text-slate-500 opacity-70 sm:opacity-0 sm:group-hover/tokenlink:opacity-100 transition-opacity shrink-0" />
      )}
    </a>
  );
}
