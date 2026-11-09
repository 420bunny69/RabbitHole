import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { neighborsOf } from '../../lib/graph'
import { displayHost } from '../../lib/url'
import type { GraphData } from '../../types'
import { SourceLabel } from '../SourceLabel'

interface Props {
  data: GraphData
  selectedId: string | null
  /** Selects a node in the graph and brings it into view. */
  onFocus: (id: string) => void
}

/** The panel beside the graph: what the selected node is and what it connects to. */
export function GraphPanel({ data, selectedId, onFocus }: Props) {
  const selected = selectedId ? data.nodes.find((node) => node.id === selectedId) : undefined
  const linked = useMemo(() => {
    if (!selectedId) return []
    const ids = neighborsOf(data, selectedId)
    return data.nodes.filter((node) => ids.has(node.id)) // keeps the order the server sent
  }, [data, selectedId])
  const selectedConceptCount = selected?.type === 'concept'
    ? selected.count ?? linked.length
    : 0

  return (
    <aside
      aria-label="Selection details"
      className="w-full shrink-0 rounded-2xl border border-rule/80 bg-panel/90 p-5 shadow-lg shadow-black/10 xl:w-80 xl:max-h-[min(72vh,820px)] xl:overflow-y-auto"
    >
      {!selected && <Overview data={data} />}

      {selected?.type === 'item' && (
        <>
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-full bg-burrow/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-burrow">
              Resource
            </span>
            <span className="text-xs tabular-nums text-ink-soft">{linked.length} connections</span>
          </div>
          <h2 className="mt-4 text-xl leading-snug font-semibold text-balance">{selected.label}</h2>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-rule bg-paper px-2.5 py-1 text-xs text-ink-soft">
              <SourceLabel type={selected.source_type ?? 'article'} />
            </span>
            {selected.url && (
              <span className="max-w-full truncate rounded-full border border-rule bg-paper px-2.5 py-1 text-xs text-ink-soft">
                {displayHost(selected.url)}
              </span>
            )}
          </div>
          {selected.item_id && (
            <Link
              to={`/items/${selected.item_id}`}
              className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:brightness-110"
            >
              Open resource
            </Link>
          )}
          <h3 className="mt-6 mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">
            <span>Extracted concepts</span>
            <span className="rounded-full bg-rule/60 px-2 py-0.5 tabular-nums">{linked.length}</span>
          </h3>
          {linked.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {linked.map((concept) => (
                <li key={concept.id}>
                  <button
                    type="button"
                    onClick={() => onFocus(concept.id)}
                    className="rounded-full border border-violet-400/25 bg-violet-950/50 px-3 py-1.5 text-xs font-medium text-violet-200 transition-colors hover:border-violet-300/60 hover:bg-violet-900/60"
                  >
                    {concept.label}
                    {(concept.count ?? 0) > 1 && (
                      <span className="ml-2 rounded-full bg-violet-300/15 px-1.5 py-0.5 text-[10px] tabular-nums text-violet-100">
                        {concept.count}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-soft">No concepts to show for this resource.</p>
          )}
        </>
      )}

      {selected?.type === 'concept' && (
        <>
          <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
            selectedConceptCount > 1
              ? 'bg-violet-400/15 text-violet-200'
              : 'bg-rule/70 text-ink-soft'
          }`}>
            {selectedConceptCount > 1 ? 'Shared concept' : 'Single concept'}
          </span>
          <h2 className="mt-4 text-xl leading-snug font-semibold text-balance">{selected.label}</h2>
          <div className="mt-4 flex items-end gap-2 rounded-xl border border-rule/80 bg-paper/70 p-3">
            <span className="text-3xl leading-none font-semibold tabular-nums text-violet-200">
              {selectedConceptCount}
            </span>
            <span className="pb-0.5 text-xs text-ink-soft">
              {selectedConceptCount === 1 ? 'Used by 1 resource' : `Shared by ${selectedConceptCount} resources`}
            </span>
          </div>
          <h3 className="mt-6 mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">
            Connected resources
          </h3>
          <ul className="space-y-2">
            {linked.map((item) => (
              <li key={item.id}>
                {item.item_id && (
                  <Link
                    to={`/items/${item.item_id}`}
                    className="group block rounded-xl border border-rule/80 bg-paper/50 px-3 py-3 transition-colors hover:border-accent/60 hover:bg-accent-soft/40"
                  >
                    <span className="line-clamp-2 text-sm font-semibold leading-snug group-hover:text-ink">{item.label}</span>
                    <span className="mt-2 block text-xs text-ink-soft">
                      <SourceLabel type={item.source_type ?? 'article'} />
                    </span>
                  </Link>
                )}
              </li>
            ))}
          </ul>
          {selectedConceptCount <= 1 && (
            <p className="mt-4 text-sm text-ink-soft">
              Save related resources and this idea will start to connect them.
            </p>
          )}
        </>
      )}
    </aside>
  )
}

function Overview({ data }: { data: GraphData }) {
  const items = data.nodes.filter((node) => node.type === 'item').length
  const concepts = data.nodes.filter((node) => node.type === 'concept')
  const shared = concepts.filter((node) => (node.count ?? 0) > 1).length
  return (
    <div>
      <span className="inline-flex rounded-full bg-accent-soft px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
        Graph guide
      </span>
      <h2 className="mt-3 text-lg font-semibold">Explore the connections</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        Resources are your saved links and notes. Concepts are the ideas connecting them. Select any node to explore its neighborhood.
      </p>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Stat label="Resources" value={items} accent="text-burrow" />
        <Stat label="Concepts" value={concepts.length} accent="text-ink" />
        <Stat label="Shared ideas" value={shared} accent="text-violet-200" />
        <Stat label="Connections" value={data.edges.length} accent="text-accent" />
      </div>
      <p className="mt-4 rounded-xl border border-rule/70 bg-paper/50 px-3 py-2.5 text-xs leading-relaxed text-ink-soft">
        {shared > 0
          ? `${shared} shared ${shared === 1 ? 'concept' : 'concepts'} connect your resources.`
          : 'As you save related resources, shared concepts will begin to connect them.'}
      </p>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-xl border border-rule/70 bg-paper/60 px-3 py-2.5">
      <span className={`block text-xl font-semibold tabular-nums ${accent}`}>{value}</span>
      <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-[0.12em] text-ink-soft">{label}</span>
    </div>
  )
}