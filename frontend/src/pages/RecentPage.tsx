import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClockIcon } from '../components/Icons'
import { SourceLabel } from '../components/SourceLabel'
import { clearRecentlyViewed, getRecentlyViewed } from '../lib/recent'
import { relativeTime } from '../lib/time'
import { displayHost } from '../lib/url'
import type { RecentlyViewedItem } from '../types'

export function RecentPage() {
  const [recentItems, setRecentItems] = useState<RecentlyViewedItem[]>([])

  useEffect(() => {
    setRecentItems(getRecentlyViewed())
  }, [])

  function handleClear() {
    clearRecentlyViewed()
    setRecentItems([])
  }

  return (
    <div className="flex flex-col gap-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2.5 text-3xl font-bold tracking-tight text-ink">
            <ClockIcon className="size-7 text-accent" />
            Recently Viewed
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Resources you have opened in this workspace session.
          </p>
        </div>
        {recentItems.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className="rounded-xl border border-rule bg-panel px-3.5 py-1.5 text-xs font-semibold text-danger hover:border-danger/60 transition-colors"
          >
            Clear History
          </button>
        )}
      </div>

      {recentItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-rule p-12 text-center">
          <ClockIcon className="mx-auto size-10 text-ink-soft/50" />
          <h2 className="mt-4 text-lg font-semibold text-ink">No recently viewed resources</h2>
          <p className="mt-1.5 text-sm text-ink-soft max-w-sm mx-auto">
            When you open resources from your library or knowledge graph, they will appear here for easy rediscovery.
          </p>
          <Link
            to="/"
            className="mt-6 inline-flex rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-on-accent"
          >
            Explore Library
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {recentItems.map((item) => (
            <li
              key={item.id}
              className="rounded-2xl border border-rule/80 bg-panel p-5 transition-all hover:border-accent/60 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-ink hover:text-accent">
                    <Link to={`/items/${item.id}`} className="hover:underline">
                      {item.title || item.url || 'Untitled Resource'}
                    </Link>
                  </h3>
                  {item.url && (
                    <span className="mt-0.5 block text-xs text-ink-soft">
                      {displayHost(item.url)}
                    </span>
                  )}
                  {item.summary && (
                    <p className="mt-2 line-clamp-2 text-xs font-reading text-ink-soft leading-relaxed">
                      {item.summary}
                    </p>
                  )}
                  <time className="mt-2 block text-[11px] text-ink-soft/70">
                    Viewed {relativeTime(item.visited_at)}
                  </time>
                </div>
                <SourceLabel type={item.source_type} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
