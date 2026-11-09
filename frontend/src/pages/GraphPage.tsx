import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorNotice } from '../components/ErrorNotice'
import { GraphIcon } from '../components/Icons'
import { KnowledgeGraph } from '../components/graph/KnowledgeGraph'
import { useGraph } from '../hooks/useGraph'
import { useSlow } from '../hooks/useSlow'

export function GraphPage() {
  const [sharedOnly, setSharedOnly] = useState(false)
  const { data, version, loading, error, reload } = useGraph(sharedOnly ? 2 : 1)
  const waking = useSlow(loading && data === null, 4000)

  const items = data ? data.nodes.filter((node) => node.type === 'item').length : 0
  const concepts = data ? data.nodes.length - items : 0
  const sharedConcepts = data?.nodes.filter((node) => node.type === 'concept' && (node.count ?? 0) > 1).length ?? 0

  return (
    <div className="relative left-1/2 flex min-h-0 w-[calc(100vw-2rem)] -translate-x-1/2 flex-1 flex-col gap-5 sm:w-[calc(100vw-4rem)] md:w-[calc(100vw-20rem)] lg:w-[calc(100vw-22rem)]">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Your ideas, mapped</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">Knowledge graph</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-soft">
            Follow the ideas that connect your resources. Select a node to explore its neighborhood.
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-rule/80 bg-panel px-3.5 py-2.5 text-sm text-ink-soft shadow-sm transition-colors hover:border-accent/50">
          <input
            type="checkbox"
            checked={sharedOnly}
            onChange={(event) => setSharedOnly(event.target.checked)}
            className="size-4 accent-accent"
          />
          <span>
            <span className="block font-medium text-ink">Shared concepts only</span>
            <span className="mt-0.5 block text-xs text-ink-soft">Focus on ideas linking resources</span>
          </span>
        </label>
      </div>

      {data && data.nodes.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Graph statistics">
          <StatChip label="Resources" value={items} />
          <StatChip label="Concepts" value={concepts} />
          <StatChip label="Shared ideas" value={sharedConcepts} />
          <StatChip label="Connections" value={data.edges.length} />
        </div>
      )}

      {error && <ErrorNotice message={error.message} onRetry={() => void reload()} />}

      {data?.truncated && (
        <p className="rounded-xl border border-accent/20 bg-accent-soft/70 px-4 py-2.5 text-sm text-ink">
          Showing your most recent resources. Older ones are left out to keep the graph readable.
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col" aria-busy={loading}>
        {data === null && !error && <Skeleton waking={waking} />}

        {data !== null && data.nodes.length === 0 && (
          <div className="relative isolate overflow-hidden rounded-2xl border border-dashed border-rule bg-panel/60 px-6 py-16 text-center shadow-inner">
            <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,color-mix(in_srgb,var(--accent)_12%,transparent),transparent_58%)]" />
            <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-accent/25 bg-accent-soft text-accent shadow-lg shadow-accent/10">
              <GraphIcon className="size-7" />
            </span>
            <p className="mt-5 text-xl font-semibold">Nothing to connect yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-soft">
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
              <p className="mb-3 rounded-xl border border-violet-400/20 bg-violet-950/30 px-4 py-3 text-sm text-violet-100">
                None of your resources share a concept yet. Your resources are still shown; as related ideas emerge, their connections will appear here.
              </p>
            )}
            <KnowledgeGraph key={version} data={data} />
          </>
        )}
      </div>
    </div>
  )
}

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-rule/80 bg-panel/75 px-3 py-1.5 text-xs">
      <span className="tabular-nums font-semibold text-ink">{value}</span>
      <span className="text-ink-soft">{label}</span>
    </span>
  )
}

function Skeleton({ waking }: { waking: boolean }) {
  return (
    <div>
      <div className="h-[60vh] min-h-96 animate-pulse rounded-2xl border border-rule bg-panel motion-reduce:animate-none" />
      <p role="status" className="mt-3 text-sm text-ink-soft">
        {waking ? 'The server is waking up after a quiet spell. This can take up to a minute.' : 'Loading your graph…'}
      </p>
    </div>
  )
}