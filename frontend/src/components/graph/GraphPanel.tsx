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

  return (
    <aside aria-label="Selection details" className="w-full shrink-0 rounded-xl border border-rule bg-panel p-5 lg:w-80 lg:overflow-y-auto">
      {!selected && <Overview data={data} />}

      {selected?.type === 'item' && (
        <>
          <h2 className="text-lg leading-snug font-semibold text-balance">{selected.label}</h2>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-ink-soft">
            <SourceLabel type={selected.source_type ?? 'article'} />
            {selected.url && <span>{displayHost(selected.url)}</span>}
          </p>
          {selected.item_id && (
            <Link
              to={`/items/${selected.item_id}`}
              className="mt-4 inline-flex rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:brightness-110"
            >
              Open resource
            </Link>
          )}
          <h3 className="mt-6 mb-2 text-sm font-medium text-ink-soft">Concepts</h3>
          {linked.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {linked.map((concept) => (
                <li key={concept.id}>
                  <button
                    type="button"
                    onClick={() => onFocus(concept.id)}
                    className="rounded-full bg-accent-soft px-2.5 py-0.5 text-sm font-medium text-accent hover:brightness-125"
                  >
                    {concept.label}
                    {(concept.count ?? 0) > 1 && <span className="ml-1.5 text-ink-soft">×{concept.count}</span>}
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
          <h2 className="text-lg leading-snug font-semibold text-balance">{selected.label}</h2>
          <p className="mt-1 text-sm text-ink-soft">
            {(selected.count ?? 0) > 1 ? `Shared by ${selected.count} resources` : 'Used by 1 resource'}
          </p>
          <ul className="mt-4 space-y-2">
            {linked.map((item) => (
              <li key={item.id}>
                {item.item_id && (
                  <Link
                    to={`/items/${item.item_id}`}
                    className="block rounded-lg border border-rule px-3 py-2 hover:border-accent"
                  >
                    <span className="line-clamp-2 text-sm font-semibold">{item.label}</span>
                    <span className="mt-0.5 block text-xs text-ink-soft">
                      <SourceLabel type={item.source_type ?? 'article'} />
                    </span>
                  </Link>
                )}
              </li>
            ))}
          </ul>
          {(selected.count ?? 0) <= 1 && (
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
  const shared = data.nodes.filter((node) => node.type === 'concept' && (node.count ?? 0) > 1).length
  return (
    <div>
      <h2 className="text-lg font-semibold">Explore the connections</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        Click a resource or a concept to see what it connects to. Concepts with a number are shared by that
        many resources, and they are what ties your reading together.
      </p>
      <p className="mt-4 text-sm text-ink-soft">
        {shared > 0
          ? `${shared} shared ${shared === 1 ? 'concept links' : 'concepts link'} your ${items} ${items === 1 ? 'resource' : 'resources'}.`
          : 'None of your resources share a concept yet.'}
      </p>
    </div>
  )
}