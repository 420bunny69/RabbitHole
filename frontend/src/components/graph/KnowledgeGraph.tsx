import '@xyflow/react/dist/style.css'
import {
  Background,
  BackgroundVariant,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  type NodeTypes,
  type OnSelectionChangeFunc,
} from '@xyflow/react'
import { useCallback, useMemo, useState } from 'react'
import { buildFlowEdges, buildFlowNodes, neighborsOf, type FlowNode } from '../../lib/graph'
import type { GraphData } from '../../types'
import { ConceptNode, FocusContext, ItemNode } from './GraphNodes'
import { GraphPanel } from './GraphPanel'

// Defined once, outside any component, so React Flow does not rebuild its node types on every render.
const nodeTypes: NodeTypes = { item: ItemNode, concept: ConceptNode }

/** The graph and its side panel. Give it a new `key` when the data changes to start fresh. */
export function KnowledgeGraph({ data }: { data: GraphData }) {
  return (
    <ReactFlowProvider>
      <Canvas data={data} />
    </ReactFlowProvider>
  )
}

function Canvas({ data }: { data: GraphData }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(useMemo(() => buildFlowNodes(data), [data]))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { fitView } = useReactFlow()

  const edges = useMemo(() => buildFlowEdges(data, selectedId), [data, selectedId])
  const focus = useMemo(
    () => ({ selectedId, related: selectedId ? neighborsOf(data, selectedId) : new Set<string>() }),
    [data, selectedId],
  )

  const onSelectionChange = useCallback<OnSelectionChangeFunc>(({ nodes: selected }) => {
    setSelectedId(selected[0]?.id ?? null)
  }, [])

  const focusNode = useCallback(
    (id: string) => {
      setNodes((current) => current.map((node) => ({ ...node, selected: node.id === id })))
      void fitView({ nodes: [{ id }], duration: 400, maxZoom: 1.2, padding: 0.6 })
    },
    [fitView, setNodes],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
      <div className="relative h-[60vh] min-h-96 overflow-hidden rounded-xl border border-rule bg-paper lg:h-auto lg:flex-1">
        <FocusContext.Provider value={focus}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onSelectionChange={onSelectionChange}
            colorMode="dark"
            fitView
            fitViewOptions={{ padding: 0.15 }}
            minZoom={0.1}
            maxZoom={2}
            deleteKeyCode={null}
            nodesConnectable={false}
            onlyRenderVisibleElements={nodes.length > 300}
            aria-label="Knowledge graph"
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="var(--rule)" />
            <Controls showInteractive={false} />
            <Panel position="top-left">
              <ul className="flex flex-wrap gap-3 rounded-lg border border-rule bg-panel/90 px-3 py-2 text-xs text-ink-soft">
                <li className="flex items-center gap-1.5">
                  <span className="size-3 rounded-sm border border-rule bg-panel" aria-hidden="true" /> Resource
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="size-3 rounded-full bg-accent-soft ring-1 ring-accent/50" aria-hidden="true" /> Shared concept
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="size-3 rounded-full border border-rule bg-paper" aria-hidden="true" /> Single concept
                </li>
              </ul>
            </Panel>
          </ReactFlow>
        </FocusContext.Provider>
      </div>
      <GraphPanel data={data} selectedId={selectedId} onFocus={focusNode} />
    </div>
  )
}