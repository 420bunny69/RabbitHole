interface IconProps {
  className?: string
}

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

/** Concentric rings seen from above: a burrow going down. */
export function LogoMark({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden className={className}>
      <circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="2" />
      <circle cx="16" cy="16" r="6.5" stroke="currentColor" strokeWidth="2" opacity=".6" />
      <circle cx="16" cy="16" r="2.4" fill="var(--accent)" />
    </svg>
  )
}

export function DocumentIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M7 3h7l5 5v13H7z" />
      <path d="M14 3v5h5M10 13h6M10 17h6" />
    </svg>
  )
}

export function PlayIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M10.5 9.5v5l4-2.5z" />
    </svg>
  )
}

export function BranchIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="7" cy="6" r="2" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="9" r="2" />
      <path d="M7 8v8M17 11c0 3-4 3-8 5" />
    </svg>
  )
}

export function QuoteIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M5 6h14M5 11h14M5 16h9" />
    </svg>
  )
}

export function SearchIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-4.2-4.2" />
    </svg>
  )
}

export function ExternalIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5" />
    </svg>
  )
}

export function BackIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  )
}

export function GraphIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="6" cy="6" r="3" />
      <circle cx="18" cy="8" r="3" />
      <circle cx="14" cy="18" r="3" />
      <path d="m8.5 7.5 7 1M8 8.5l4 7M15.5 15.5l1.5-5" />
    </svg>
  )
}

export function CompassIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="9" />
      <polygon points="16.2 7.8 14.1 14.1 7.8 16.2 9.9 9.9" />
    </svg>
  )
}

export function SparklesIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="m12 3 1.9 4.8L19 9.7l-4 3.4 1.2 5.1-4.2-2.6-4.2 2.6 1.2-5.1-4-3.4 5.1-1.9z" />
    </svg>
  )
}

export function TagIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  )
}

export function ClockIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

export function MenuIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

export function CopyIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

export function NoteIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  )
}

export function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

export function FilterIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  )
}
