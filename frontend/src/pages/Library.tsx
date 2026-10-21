import { useMemo, useState } from 'react'
import { toApiError } from '../api/client'
import { retryItem } from '../api/items'
import { AddItemForm } from '../components/AddItemForm'
import { ErrorNotice } from '../components/ErrorNotice'
import { SearchIcon } from '../components/Icons'
import { ItemRow } from '../components/ItemRow'
import { useDebounced } from '../hooks/useDebounced'
import { useItems } from '../hooks/useItems'
import { useSlow } from '../hooks/useSlow'
import { groupByDay } from '../lib/time'
import type { Item } from '../types'

export function Library() {
  const [search, setSearch] = useState('')
  const query = useDebounced(search.trim(), 300)
  const { items, loading, error, reload, upsert } = useItems(query)
  const [actionError, setActionError] = useState<string | null>(null)
  const waking = useSlow(loading && items === null, 4000)
  const groups = useMemo(() => groupByDay(items ?? []), [items])
  const searching = query.length > 0

  function handleCreated(item: Item, existing: boolean) {
    setSearch('')
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

  return (
    <>
      <h1 className="sr-only">Your library</h1>
      <AddItemForm onCreated={handleCreated} />

      <div className="mt-14" aria-busy={loading}>
        {((items?.length ?? 0) > 0 || search.length > 0) && (
          <div className="relative mb-10">
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
              className="w-full rounded-lg border border-rule bg-transparent py-2.5 pr-4 pl-11 focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
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
              <button type="button" onClick={() => setSearch('')} className="font-semibold text-ink underline underline-offset-4">
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
        ) : (
          <div className={`relative ${loading ? 'opacity-60' : ''}`}>
            {/* The line the items hang from. It fades out below the last one, as if it keeps going. */}
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
