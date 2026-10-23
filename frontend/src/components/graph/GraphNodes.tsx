import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { createContext, useContext } from 'react'
import { CONCEPT_MAX_WIDTH, type ConceptNodeData, type ItemNodeData } from '../../lib/graph'
import { SourceLabel } from '../SourceLabel'

/** What is selected, and what is connected to it. Everything else fades back. */
export type Focus = { selectedId: string | null; related: ReadonlySet<string> }
export const FocusContext = createContext<Focus>({ selectedId: null, related: new Set() })

function useFaded(id: string): boolean {
  const { selectedId, related } = useContext(FocusContext)
  return selectedId !== null && id !== selectedId && !related.has(id)
}

// Lines attach to an invisible point in the middle of each node and are drawn behind it.
const anchorStyle = { opacity: 0, pointerEvents: 'none', left: '50%', top: '50%' } as const

function Anchors() {
  return (
    <>
      <Handle type="target" position={Position.Top} isConnectable={false} style={anchorStyle} />
      <Handle type="source" position={Position.Top} isConnectable={false} style={anchorStyle} />
    </>
  )
}

export function ItemNode({ id, data, selected }: NodeProps<Node<ItemNodeData, 'item'>>) {
  const faded = useFaded(id)
  return (
    <div
      className={`w-58 rounded-xl border bg-panel px-3.5 py-2.5 text-left transition-opacity ${
        selected ? 'border-accent ring-1 ring-accent' : 'border-rule hover:border-info'
      } ${faded ? 'opacity-30' : ''}`}
    >
      <Anchors />
      <p className="line-clamp-2 text-sm leading-snug font-semibold text-ink">{data.label}</p>
      <p className="mt-1 text-xs text-ink-soft">
        <SourceLabel type={data.sourceType ?? 'article'} />
      </p>
    </div>
  )
}

export function ConceptNode({ id, data, selected }: NodeProps<Node<ConceptNodeData, 'concept'>>) {
  const faded = useFaded(id)
  const shared = data.count > 1
  return (
    <div
      style={{ maxWidth: CONCEPT_MAX_WIDTH }}
      className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-opacity ${
        shared ? 'border-accent/50 bg-accent-soft text-accent' : 'border-rule bg-paper text-ink-soft'
      } ${selected ? 'ring-2 ring-accent' : ''} ${faded ? 'opacity-30' : ''}`}
    >
      <Anchors />
      <span className="truncate">{data.label}</span>
      {shared && (
        <span className="rounded-full bg-accent px-1.5 text-xs font-semibold text-on-accent">{data.count}</span>
      )}
    </div>
  )
}