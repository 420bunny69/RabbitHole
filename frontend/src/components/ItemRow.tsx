import { useState } from 'react'
import { Link } from 'react-router-dom'
import { isActive, statusMessage } from '../lib/status'
import { relativeTime } from '../lib/time'
import { displayHost, displayLocation } from '../lib/url'
import type { Item } from '../types'
import { ConceptList } from './ConceptList'
import { SourceLabel } from './SourceLabel'
import { StatusNode } from './StatusNode'

interface Props {
  item: Item
  onRetry: (id: string) => Promise<void>
}

/** One saved item, hanging off the library's vertical line. The whole row opens the item. */
export function ItemRow({ item, onRetry }: Props) {
  const [retrying, setRetrying] = useState(false)
  const title = item.title ?? (item.url ? displayLocation(item.url) : 'Pasted text')

  async function retry() {
    setRetrying(true)
    try {
      await onRetry(item.id)
    } finally {
      setRetrying(false)
    }
  }

  return (
    <li className="relative pb-9 pl-9">
      <StatusNode status={item.status} />
      <div className="relative">
        <h3 className="text-xl leading-snug font-semibold tracking-tight text-balance">
          <Link
            to={`/items/${item.id}`}
            className="after:absolute after:inset-0 hover:text-accent focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-4 focus-visible:after:outline-accent"
          >
            {title}
          </Link>
        </h3>

        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-soft">
          <SourceLabel type={item.source_type} />
          {item.url && <span>{displayHost(item.url)}</span>}
          <time dateTime={item.created_at} title={new Date(item.created_at).toLocaleString()}>
            {relativeTime(item.created_at)}
          </time>
        </p>

        {item.status === 'ready' && item.summary && (
          <p className="mt-2 line-clamp-2 font-reading text-[1.05rem] leading-relaxed text-ink-soft">
            {item.summary}
          </p>
        )}
        {isActive(item.status) && <p className="mt-2 text-ink-soft">{statusMessage(item)}</p>}
        {item.status === 'failed' && (
          <div className="mt-2">
            <p className="text-danger">{statusMessage(item)}</p>
            <button
              type="button"
              onClick={() => void retry()}
              disabled={retrying}
              className="relative z-10 mt-1 text-sm font-semibold underline underline-offset-4 hover:text-accent disabled:opacity-50"
            >
              {retrying ? 'Retrying…' : 'Retry'}
            </button>
          </div>
        )}

        {item.status === 'ready' && <ConceptList names={item.concepts ?? []} className="mt-3" />}
      </div>
    </li>
  )
}
