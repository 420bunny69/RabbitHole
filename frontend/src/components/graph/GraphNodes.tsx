import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { useContext } from 'react'
import { CONCEPT_MAX_WIDTH, type ConceptNodeData, type ItemNodeData } from '../../lib/graph'
import { SourceLabel } from '../SourceLabel'
import { FocusContext, nodeFocusState } from './GraphFocusContext'

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
  const { faded, matched } = nodeFocusState(id, useContext(FocusContext))
  return (
    <div
      className={`w-[264px] rounded-2xl border bg-panel/95 px-4 py-3 text-left shadow-lg shadow-black/20 transition-[opacity,border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-info hover:shadow-xl ${
        selected
          ? 'border-accent ring-2 ring-accent/70 shadow-[0_0_24px_color-mix(in_srgb,var(--accent)_18%,transparent)]'
          : matched
            ? 'border-info ring-2 ring-info/60'
            : 'border-rule/90'
      } ${faded ? 'opacity-20' : ''}`}
    >
      <Anchors />
      <span className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-soft">
        <span className="size-1.5 rounded-full bg-burrow shadow-[0_0_8px_color-mix(in_srgb,var(--burrow)_70%,transparent)]" />
        Resource
      </span>
      <p className="line-clamp-2 min-h-10 text-sm leading-snug font-semibold text-ink">{data.label}</p>
      <p className="mt-2 border-t border-rule/70 pt-2 text-xs text-ink-soft">
        <SourceLabel type={data.sourceType ?? 'article'} />
      </p>
    </div>
  )
}

export function ConceptNode({ id, data, selected }: NodeProps<Node<ConceptNodeData, 'concept'>>) {
  const { faded, matched } = nodeFocusState(id, useContext(FocusContext))
  const shared = data.count > 1
  return (
    <div
      style={{ maxWidth: CONCEPT_MAX_WIDTH }}
      className={`flex items-center gap-2.5 rounded-full border px-3.5 py-2 text-xs font-medium shadow-md shadow-black/10 transition-[opacity,border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 ${
        shared
          ? 'border-violet-400/50 bg-violet-950/80 text-violet-200 shadow-violet-950/30 hover:border-violet-300'
          : 'border-rule bg-panel/90 text-ink-soft hover:border-ink-soft/60'
      } ${selected ? 'ring-2 ring-accent/80 shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_22%,transparent)]' : ''} ${
        matched ? 'ring-2 ring-info/60' : ''
      } ${faded ? 'opacity-20' : ''}`}
    >
      <Anchors />
      <span className="truncate">{data.label}</span>
      {shared && (
        <span className="shrink-0 rounded-full bg-violet-400/20 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-violet-100">
          {data.count}
        </span>
      )}
    </div>
  )
}