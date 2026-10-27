import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toApiError } from '../api/client'
import { retryItem } from '../api/items'
import { AddItemForm } from '../components/AddItemForm'
import { ErrorNotice } from '../components/ErrorNotice'
import { FilterIcon, SearchIcon } from '../components/Icons'
import { ItemRow } from '../components/ItemRow'
import { useDebounced } from '../hooks/useDebounced'
import { useItems } from '../hooks/useItems'
import { useSlow } from '../hooks/useSlow'
import { groupByDay } from '../lib/time'
import type { Item, ItemStatus, SourceType } from '../types'

type SourceFilter = 'all' | SourceType
type StatusFilter = 'all' | ItemStatus
type SortOption = 'newest' | 'oldest' | 'title'

export function Library() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialQuery = searchParams.get('q') ?? ''
  const [search, setSearch] = useState(initialQuery)
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortBy, setSortBy] = useState<SortOption>('newest')

  // Keep search state in sync when URL parameter changes
  useEffect(() => {
    const q = searchParams.get('q') ?? ''
    if (q !== search) {
      setSearch(q)
    }
  }, [searchParams])

  const query = useDebounced(search.trim(), 300)
  const { items, loading, error, reload, upsert } = useItems(query)
  const [actionError, setActionError] = useState<string | null>(null)
  const waking = useSlow(loading && items === null, 4000)

  // Filter and sort items locally
  const filteredItems = useMemo(() => {
    if (!items) return null
    let list = [...items]

    if (sourceFilter !== 'all') {
      list = list.filter((item) => item.source_type === sourceFilter)
    }
    if (statusFilter !== 'all') {
      list = list.filter((item) => item.status === statusFilter)
    }

    // Tag items with their original API index so sort is always stable.
    const indexed = list.map((item, i) => ({ item, i }))

    if (sortBy === 'newest') {
      indexed.sort((a, b) => {
        const diff = new Date(b.item.created_at).getTime() - new Date(a.item.created_at).getTime()
        return diff !== 0 ? diff : a.i - b.i
      })
    } else if (sortBy === 'oldest') {
      indexed.sort((a, b) => {
        const diff = new Date(a.item.created_at).getTime() - new Date(b.item.created_at).getTime()
        return diff !== 0 ? diff : a.i - b.i
      })
    } else if (sortBy === 'title') {
      indexed.sort((a, b) => {
        const diff = (a.item.title ?? '').localeCompare(b.item.title ?? '')
        return diff !== 0 ? diff : a.i - b.i
      })
    }

    return indexed.map(({ item }) => item)
  }, [items, sourceFilter, statusFilter, sortBy])

  const groups = useMemo(() => groupByDay(filteredItems ?? []), [filteredItems])
  const searching = query.length > 0

  function handleCreated(item: Item, existing: boolean) {
    setSearch('')
    setSearchParams({})
    if (!existing) upsert(item, { toTop: true })
  }

  async function handleRetry(id: string) {
    setActionError(null)
    try {
      upsert(await retryItem(id))
    } catch (caught) {
      setActionError(toApiError(caught).message)
    }
  }

  function handleClearSearch() {
    setSearch('')
    setSearchParams({})
  }

  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          Your knowledge, connected.
        </h1>
        <p className="mt-2 text-base text-ink-soft">
          Save articles, YouTube videos, GitHub repositories, and notes into an interconnected research library.
        </p>
      </div>

      <AddItemForm onCreated={handleCreated} />

      <div className="mt-12" aria-busy={loading}>
        {/* Search, Filter and Sorting controls */}
        {((items?.length ?? 0) > 0 || search.length > 0) && (
          <div className="mb-8 space-y-4">
            <div className="relative">
              <label htmlFor="library-search" className="sr-only">
                Search your library
              </label>
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-ink-soft" />
              <input
                id="library-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search titles, summaries and links"
                className="w-full rounded-xl border border-rule bg-panel py-3 pr-4 pl-11 text-sm text-ink placeholder:text-ink-soft/60 focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent shadow-sm"
              />
            </div>

            {/* Filter toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1 font-medium text-ink-soft">
                  <FilterIcon className="size-3.5" />
                  Type:
                </span>
                {(['all', 'article', 'youtube', 'github', 'text'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSourceFilter(t)}
                    className={`rounded-lg px-2.5 py-1 capitalize transition-colors ${
                      sourceFilter === t
                        ? 'bg-ink text-paper font-semibold'
                        : 'bg-panel border border-rule text-ink-soft hover:text-ink'
                    }`}
                  >
                    {t === 'all' ? 'All sources' : t}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-ink-soft font-medium">Status:</span>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                    className="rounded-lg border border-rule bg-panel px-2 py-1 text-xs text-ink focus-visible:outline-none"
                  >
                    <option value="all">All statuses</option>
                    <option value="ready">Ready</option>
                    <option value="processing">Processing</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-ink-soft font-medium">Sort:</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    className="rounded-lg border border-rule bg-panel px-2 py-1 text-xs text-ink focus-visible:outline-none"
                  >
                    <option value="newest">Newest</option>
                    <option value="oldest">Oldest</option>
                    <option value="title">Title A-Z</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Counts from actual data */}
            {items && items.length > 0 && (
              <p className="text-xs text-ink-soft">
                Showing {filteredItems?.length ?? 0} of {items.length} {items.length === 1 ? 'saved resource' : 'saved resources'}
              </p>
            )}
          </div>
        )}

        {actionError && (
          <div className="mb-6">
            <ErrorNotice message={actionError} />
          </div>
        )}

        {error && !items ? (
          <ErrorNotice message={error.message} onRetry={() => void reload()} />
        ) : items === null ? (
          <ListSkeleton waking={waking} />
        ) : items.length === 0 ? (
          searching ? (
            <p className="text-ink-soft">
              Nothing in your library matches “{query}”.{' '}
              <button
                type="button"
                onClick={handleClearSearch}
                className="font-semibold text-ink underline underline-offset-4"
              >
                Clear search
              </button>
            </p>
          ) : (
            <div className="max-w-md">
              <h2 className="text-2xl font-semibold tracking-tight">Nothing saved yet</h2>
              <p className="mt-2 font-reading text-lg leading-relaxed text-ink-soft">
                Paste a link or some text above. RabbitHole will summarize it and pull out the key ideas.
              </p>
            </div>
          )
        ) : filteredItems?.length === 0 ? (
          <p className="text-ink-soft">
            No resources match the selected filters.{' '}
            <button
              type="button"
              onClick={() => {
                setSourceFilter('all')
                setStatusFilter('all')
              }}
              className="font-semibold text-ink underline underline-offset-4"
            >
              Reset filters
            </button>
          </p>
        ) : (
          <div className={`relative ${loading ? 'opacity-60' : ''}`}>
            {/* The line the items hang from */}
            <div
              aria-hidden
              className="absolute top-3 bottom-0 left-2.5 w-px bg-linear-to-b from-burrow/40 from-85% to-transparent"
            />
            {groups.map((group) => (
              <section key={group.label}>
                <h2 className="mb-5 pl-9 text-sm font-medium text-ink-soft">{group.label}</h2>
                <ol>
                  {group.items.map((item) => (
                    <ItemRow key={item.id} item={item} onRetry={handleRetry} />
                  ))}
                </ol>
              </section>
            ))}
          </div>
        )}

        {error && items && (
          <p role="status" className="mt-4 text-sm text-ink-soft">
            Can't refresh right now. Trying again…
          </p>
        )}
      </div>
    </>
  )
}

function ListSkeleton({ waking }: { waking: boolean }) {
  return (
    <div>
      {waking && (
        <p role="status" className="mb-6 text-ink-soft">
          The server is waking up. The first request can take up to 30 seconds.
        </p>
      )}
      <div aria-hidden className="space-y-9">
        {[0, 1, 2].map((row) => (
          <div key={row} className="animate-pulse space-y-3 pl-9 motion-reduce:animate-none">
            <div className="h-6 w-2/3 rounded bg-rule/60" />
            <div className="h-4 w-1/3 rounded bg-rule/40" />
            <div className="h-4 w-5/6 rounded bg-rule/40" />
          </div>
        ))}
      </div>
    </div>
  )
}
