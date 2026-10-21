import type { ComponentType } from 'react'
import type { SourceType } from '../types'
import { BranchIcon, DocumentIcon, PlayIcon, QuoteIcon } from './Icons'

const SOURCES: Record<SourceType, { label: string; Icon: ComponentType<{ className?: string }> }> = {
  article: { label: 'Article', Icon: DocumentIcon },
  youtube: { label: 'YouTube video', Icon: PlayIcon },
  github: { label: 'GitHub repo', Icon: BranchIcon },
  text: { label: 'Pasted text', Icon: QuoteIcon },
}

export function SourceLabel({ type }: { type: SourceType }) {
  const { label, Icon } = SOURCES[type] ?? SOURCES.article
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="size-4" />
      {label}
    </span>
  )
}
