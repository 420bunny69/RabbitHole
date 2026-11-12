import '@xyflow/react/dist/style.css'
import {
  Background,
  BackgroundVariant,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  type NodeTypes,
  type OnSelectionChangeFunc,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildFlowEdges, buildFlowNodes, neighborsOf, type FlowNode } from '../../lib/graph'
import type { GraphData } from '../../types'
import { SearchIcon } from '../Icons'
import { FocusContext } from './GraphFocusContext'
import { ConceptNode, ItemNode } from './GraphNodes'
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
  const [graphSearch, setGraphSearch] = useState('')
  const [fullscreen, setFullscreen] = useState(false)
  const [fullscreenError, setFullscreenError] = useState('')
  const canvasRef = useRef<HTMLDivElement>(null)
  const { fitView } = useReactFlow()
  const nodesInitialized = useNodesInitialized()

  const edges = useMemo(() => buildFlowEdges(data, selectedId), [data, selectedId])
  const matchingNodes = useMemo(() => {
    const q = graphSearch.trim().toLowerCase()
    return q ? data.nodes.filter((node) => node.label.toLowerCase().includes(q)) : []
  }, [data.nodes, graphSearch])
  const matchingIds = useMemo(() => new Set(matchingNodes.map((node) => node.id)), [matchingNodes])
  const searching = graphSearch.trim().length > 0
  const focus = useMemo(
    () => ({
      selectedId,
      related: selectedId ? neighborsOf(data, selectedId) : new Set<string>(),
      matching: matchingIds,
      searching,
    }),
    [data, matchingIds, searching, selectedId],
  )

  useEffect(() => {
    const updateFullscreen = () => setFullscreen(document.fullscreenElement === canvasRef.current)
    document.addEventListener('fullscreenchange', updateFullscreen)
    return () => document.removeEventListener('fullscreenchange', updateFullscreen)
  }, [])

  const onSelectionChange = useCallback<OnSelectionChangeFunc>(({ nodes: selected }) => {
    setSelectedId(selected[0]?.id ?? null)
  }, [])

  const fitGraph = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return false
    const { width, height } = canvas.getBoundingClientRect()
    if (width === 0 || height === 0) return false
    void fitView({ duration: 350, padding: 0.22, maxZoom: 1.15, minZoom: 0.1 })
    return true
  }, [fitView])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!nodesInitialized || !canvas) return

    let frame = 0
    let initialFitComplete = false
    let orientationFitPending = false
    const scheduleFit = (orientationChanged = false) => {
      orientationFitPending ||= orientationChanged
      if (frame) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        frame = 0
        if (initialFitComplete && !orientationFitPending) return
        if (fitGraph()) {
          initialFitComplete = true
          orientationFitPending = false
        }
      })
    }

    const observer = new ResizeObserver(() => {
      if (!initialFitComplete || orientationFitPending) scheduleFit()
    })
    const orientation = window.matchMedia('(orientation: portrait)')
    let wasPortrait = orientation.matches
    const handleOrientationChange = () => {
      if (orientation.matches === wasPortrait) return
      wasPortrait = orientation.matches
      scheduleFit(true)
    }

    observer.observe(canvas)
    orientation.addEventListener('change', handleOrientationChange)
    scheduleFit()
    return () => {
      observer.disconnect()
      orientation.removeEventListener('change', handleOrientationChange)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [fitGraph, nodesInitialized])

  const focusNode = useCallback(
    (id: string) => {
      setSelectedId(id)
      setNodes((current) => current.map((node) => ({ ...node, selected: node.id === id })))
      const relatedIds = neighborsOf(data, id)
      void fitView({
        nodes: [{ id }, ...Array.from(relatedIds, (relatedId) => ({ id: relatedId }))],
        duration: 350,
        maxZoom: 1.1,
        padding: 0.38,
      })
    },
    [data, fitView, setNodes],
  )

  const toggleFullscreen = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    setFullscreenError('')
    try {
      if (document.fullscreenElement === canvas) await document.exitFullscreen()
      else await canvas.requestFullscreen()
    } catch {
      setFullscreenError('Fullscreen is unavailable in this browser.')
    }
  }, [])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 xl:flex-row">
      <div
        ref={canvasRef}
        className="knowledge-graph-canvas relative h-[min(62dvh,720px)] min-h-[min(360px,58dvh)] min-w-0 flex-1 overflow-hidden rounded-2xl border border-rule/80 bg-paper shadow-xl shadow-black/15 sm:h-[min(72vh,820px)] sm:min-h-[520px]"
      >
        <FocusContext.Provider value={focus}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onSelectionChange={onSelectionChange}
            colorMode="dark"
            panOnDrag
            zoomOnPinch
            minZoom={0.1}
            maxZoom={1.8}
            deleteKeyCode={null}
            nodesConnectable={false}
            onlyRenderVisibleElements={nodes.length > 300}
            aria-label="Knowledge graph"
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="var(--rule)" />
            <Controls showFitView={false} showInteractive={false} />

            {/* Legend */}
            <Panel position="top-left">
              <ul className="hidden flex-wrap gap-3 rounded-xl border border-rule/80 bg-panel/90 px-3 py-2.5 text-xs text-ink-soft shadow-lg backdrop-blur-md sm:flex">
                <li className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-burrow" aria-hidden="true" /> Resource
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-violet-400" aria-hidden="true" /> Shared concept
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-ink-soft/60" aria-hidden="true" /> Single concept
                </li>
              </ul>
            </Panel>

            {/* In-Graph Search Bar */}
            <Panel position="top-right">
              <div className="flex items-start gap-2">
                <div className="relative w-40 sm:w-56">
                  <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-soft/70" />
                  <input
                    type="search"
                    aria-label="Find node in graph"
                    value={graphSearch}
                    onChange={(event) => setGraphSearch(event.target.value)}
                    placeholder="Find a connection…"
                    className="w-full rounded-xl border border-rule/90 bg-panel/95 py-2 pr-3 pl-9 text-xs text-ink shadow-lg shadow-black/10 backdrop-blur-md placeholder:text-ink-soft/60 focus-visible:border-accent focus-visible:outline-none"
                  />
                  {searching && (
                    <ul className="absolute top-full right-0 z-50 mt-2 max-h-64 w-64 overflow-y-auto rounded-xl border border-rule bg-panel py-1.5 text-xs shadow-2xl">
                      {matchingNodes.length > 0 ? matchingNodes.slice(0, 8).map((node) => (
                        <li key={node.id}>
                          <button
                            type="button"
                            onClick={() => {
                              focusNode(node.id)
                              setGraphSearch('')
                            }}
                            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-accent-soft hover:text-accent"
                          >
                            <span className="truncate">{node.label}</span>
                            <span className="shrink-0 text-[10px] uppercase tracking-wider text-ink-soft/70">
                              {node.type === 'item' ? 'Resource' : 'Concept'}
                            </span>
                          </button>
                        </li>
                      )) : (
                        <li className="px-3 py-2 text-ink-soft">No matching nodes</li>
                      )}
                    </ul>
                  )}
                </div>
                <div className="flex overflow-hidden rounded-xl border border-rule/90 bg-panel/95 shadow-lg shadow-black/10 backdrop-blur-md">
                  <button
                    type="button"
                    onClick={fitGraph}
                    aria-label="Fit graph to view"
                    title="Fit graph to view"
                    className="border-r border-rule px-2.5 py-2 text-xs font-medium text-ink-soft transition-colors hover:bg-accent-soft hover:text-ink"
                  >
                    Fit
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleFullscreen()}
                    aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                    title={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                    className="px-2.5 py-2 text-xs font-medium text-ink-soft transition-colors hover:bg-accent-soft hover:text-ink"
                  >
                    {fullscreen ? 'Exit' : 'Expand'}
                  </button>
                </div>
              </div>
            </Panel>
          </ReactFlow>
        </FocusContext.Provider>
      </div>
      {fullscreenError && <p role="status" className="text-xs text-ink-soft">{fullscreenError}</p>}
      <GraphPanel data={data} selectedId={selectedId} onFocus={focusNode} />
    </div>
  )
}
