import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorNotice } from '../components/ErrorNotice'
import { KnowledgeGraph } from '../components/graph/KnowledgeGraph'
import { useGraph } from '../hooks/useGraph'
import { useSlow } from '../hooks/useSlow'

export function GraphPage() {
  const [sharedOnly, setSharedOnly] = useState(false)
  const { data, version, loading, error, reload } = useGraph(sharedOnly ? 2 : 1)
  const waking = useSlow(loading && data === null, 4000)

  const items = data ? data.nodes.filter((node) => node.type === 'item').length : 0
  const concepts = data ? data.nodes.length - items : 0

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Knowledge graph</h1>
          {data && data.nodes.length > 0 && (
            <p className="mt-1 text-sm text-ink-soft">
              {items} {items === 1 ? 'resource' : 'resources'} · {concepts} {concepts === 1 ? 'concept' : 'concepts'}
            </p>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={sharedOnly}
            onChange={(event) => setSharedOnly(event.target.checked)}
            className="size-4 accent-accent"
          />
          Shared concepts only
        </label>
      </div>

      {error && <ErrorNotice message={error.message} onRetry={() => void reload()} />}

      {data?.truncated && (
        <p className="rounded-lg bg-accent-soft px-4 py-2 text-sm text-ink">
          Showing your most recent resources. Older ones are left out to keep the graph readable.
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col" aria-busy={loading}>
        {data === null && !error && <Skeleton waking={waking} />}

        {data !== null && data.nodes.length === 0 && (
          <div className="rounded-xl border border-dashed border-rule px-6 py-16 text-center">
            <p className="text-lg font-semibold">Nothing to connect yet</p>
            <p className="mx-auto mt-2 max-w-md text-ink-soft">
              {sharedOnly
                ? 'No resources are ready yet. Once a few are saved, ideas they have in common will show up here.'
                : 'Save a few links or notes and let them finish processing. Their ideas will appear here as a map.'}
            </p>
            <Link to="/" className="mt-5 inline-flex rounded-lg bg-accent px-4 py-2 font-semibold text-on-accent hover:brightness-110">
              Go to your library
            </Link>
          </div>
        )}

        {data !== null && data.nodes.length > 0 && (
          <>
            {sharedOnly && data.edges.length === 0 && (
              <p className="mb-3 rounded-lg bg-accent-soft px-4 py-2 text-sm text-ink">
                None of your resources share a concept yet. Save more on related topics and they will connect.
              </p>
            )}
            <KnowledgeGraph key={version} data={data} />
          </>
        )}
      </div>
    </div>
  )
}

function Skeleton({ waking }: { waking: boolean }) {
  return (
    <div>
      <div className="h-[60vh] min-h-96 animate-pulse rounded-xl border border-rule bg-panel motion-reduce:animate-none" />
      <p role="status" className="mt-3 text-sm text-ink-soft">
        {waking ? 'The server is waking up after a quiet spell. This can take up to a minute.' : 'Loading your graph…'}
      </p>
    </div>
  )
}