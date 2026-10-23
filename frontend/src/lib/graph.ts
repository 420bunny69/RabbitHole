import type { Edge, Node } from '@xyflow/react'
import type { GraphData, GraphNode, SourceType } from '../types'

export type Size = { width: number; height: number }
export type Point = { x: number; y: number }

export type ItemNodeData = { label: string; sourceType: SourceType | null; url: string | null }
export type ConceptNodeData = { label: string; count: number }
export type FlowNode = Node<ItemNodeData, 'item'> | Node<ConceptNodeData, 'concept'>

const ITEM_SIZE: Size = { width: 232, height: 88 }
export const CONCEPT_MAX_WIDTH = 220

/** Roughly how big a node is on screen, so the layout can keep nodes from overlapping. */
export function nodeSize(node: Pick<GraphNode, 'type' | 'label'>): Size {
  if (node.type === 'item') return ITEM_SIZE
  return { width: Math.min(CONCEPT_MAX_WIDTH, Math.max(96, 48 + node.label.length * 7.4)), height: 36 }
}

type LayoutNode = { id: string } & Size
type LayoutLink = { source: string; target: string }

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
const IDEAL_DISTANCE = 280 // how far apart connected nodes like to sit
const GRAVITY = 0.12 // a gentle pull to the middle so separate clusters stay on screen

/**
 * Places nodes so that connected ones sit close together and unconnected ones drift apart
 * (a "force-directed" layout, Fruchterman-Reingold style). It starts from a spiral and uses no
 * randomness, so the same data always gives the same picture. Returns each node's top-left corner.
 */
export function layoutGraph(nodes: LayoutNode[], links: LayoutLink[]): Record<string, Point> {
  const count = nodes.length
  if (count === 0) return {}
  if (count === 1) return { [nodes[0].id]: { x: -nodes[0].width / 2, y: -nodes[0].height / 2 } }

  const indexOf = new Map(nodes.map((node, i) => [node.id, i]))
  const pairs: [number, number][] = []
  for (const link of links) {
    const a = indexOf.get(link.source)
    const b = indexOf.get(link.target)
    if (a !== undefined && b !== undefined && a !== b) pairs.push([a, b])
  }

  const x = new Float64Array(count)
  const y = new Float64Array(count)
  for (let i = 0; i < count; i++) {
    const radius = 110 * Math.sqrt(i + 0.5)
    x[i] = radius * Math.cos(i * GOLDEN_ANGLE)
    y[i] = radius * Math.sin(i * GOLDEN_ANGLE)
  }

  // Fewer rounds for very large graphs, so the page never freezes.
  const rounds = count <= 150 ? 300 : count <= 500 ? 150 : 60
  const cooling = Math.pow(0.01, 1 / rounds)
  let maxMove = IDEAL_DISTANCE
  const dx = new Float64Array(count)
  const dy = new Float64Array(count)

  for (let round = 0; round < rounds; round++) {
    dx.fill(0)
    dy.fill(0)
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        let ex = x[i] - x[j]
        let ey = y[i] - y[j]
        let dist = Math.hypot(ex, ey)
        if (dist < 0.01) {
          ex = (i + 1) * 0.01
          ey = (j + 1) * 0.01
          dist = Math.hypot(ex, ey)
        }
        const push = (IDEAL_DISTANCE * IDEAL_DISTANCE) / (dist * dist) // every pair repels
        dx[i] += ex * push
        dy[i] += ey * push
        dx[j] -= ex * push
        dy[j] -= ey * push
      }
    }
    for (const [a, b] of pairs) {
      const ex = x[a] - x[b]
      const ey = y[a] - y[b]
      const pull = Math.hypot(ex, ey) / IDEAL_DISTANCE // linked nodes attract
      dx[a] -= ex * pull
      dy[a] -= ey * pull
      dx[b] += ex * pull
      dy[b] += ey * pull
    }
    for (let i = 0; i < count; i++) {
      dx[i] -= x[i] * GRAVITY
      dy[i] -= y[i] * GRAVITY
      const length = Math.hypot(dx[i], dy[i])
      if (length === 0) continue
      const scale = Math.min(length, maxMove) / length
      x[i] += dx[i] * scale
      y[i] += dy[i] * scale
    }
    maxMove *= cooling
  }

  // The forces work on points, but nodes are boxes: push apart any boxes that still overlap.
  const gapX = 24
  const gapY = 20
  const passes = count <= 300 ? 200 : 30
  for (let pass = 0; pass < passes; pass++) {
    let moved = false
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        const overlapX = (nodes[i].width + nodes[j].width) / 2 + gapX - Math.abs(x[i] - x[j])
        const overlapY = (nodes[i].height + nodes[j].height) / 2 + gapY - Math.abs(y[i] - y[j])
        if (overlapX <= 0 || overlapY <= 0) continue
        moved = true
        if (overlapX < overlapY) {
          const shift = (overlapX / 2) * (x[i] >= x[j] ? 1 : -1)
          x[i] += shift
          x[j] -= shift
        } else {
          const shift = (overlapY / 2) * (y[i] >= y[j] ? 1 : -1)
          y[i] += shift
          y[j] -= shift
        }
      }
    }
    if (!moved) break
  }

  const positions: Record<string, Point> = {}
  nodes.forEach((node, i) => {
    positions[node.id] = { x: x[i] - node.width / 2, y: y[i] - node.height / 2 }
  })
  return positions
}

/** Turns the backend's graph into React Flow nodes, already laid out. */
export function buildFlowNodes(data: GraphData): FlowNode[] {
  const sizes = data.nodes.map((node) => ({ id: node.id, ...nodeSize(node) }))
  const positions = layoutGraph(sizes, data.edges)
  return data.nodes.map((node): FlowNode =>
    node.type === 'item'
      ? {
          id: node.id,
          type: 'item',
          position: positions[node.id],
          data: { label: node.label, sourceType: node.source_type, url: node.url },
        }
      : {
          id: node.id,
          type: 'concept',
          position: positions[node.id],
          data: { label: node.label, count: node.count ?? 1 },
        },
  )
}

/** The ids of everything directly connected to `id`. */
export function neighborsOf(data: GraphData, id: string): Set<string> {
  const neighbors = new Set<string>()
  for (const edge of data.edges) {
    if (edge.source === id) neighbors.add(edge.target)
    else if (edge.target === id) neighbors.add(edge.source)
  }
  return neighbors
}

/** Lines between nodes. Lines touching the selected node light up; the rest fade back. */
export function buildFlowEdges(data: GraphData, selectedId: string | null): Edge[] {
  return data.edges.map((edge) => {
    const touchesSelection = selectedId !== null && (edge.source === selectedId || edge.target === selectedId)
    const faded = selectedId !== null && !touchesSelection
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'straight',
      selectable: false,
      focusable: false,
      deletable: false,
      style: {
        stroke: touchesSelection ? 'var(--accent)' : 'var(--ink-soft)',
        strokeWidth: touchesSelection ? 2 : 1.25,
        opacity: faded ? 0.07 : touchesSelection ? 0.95 : 0.18 + 0.4 * edge.weight,
      },
    }
  })
}