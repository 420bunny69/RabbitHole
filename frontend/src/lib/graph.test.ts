import { describe, expect, it } from 'vitest'
import type { GraphData, GraphNode } from '../types'
import { buildFlowEdges, buildFlowNodes, layoutGraph, neighborsOf, nodeSize } from './graph'

const item = (n: number): GraphNode => ({
  id: `item:${n}`, type: 'item', label: `Resource ${n}`, item_id: `id-${n}`,
  source_type: 'article', url: `https://example.com/${n}`, count: null,
})
const concept = (n: number, count = 2): GraphNode => ({
  id: `concept:${n}`, type: 'concept', label: `idea ${n}`, item_id: null,
  source_type: null, url: null, count,
})

const sample: GraphData = {
  nodes: [item(1), item(2), item(3), concept(1), concept(2)],
  edges: [
    { id: 'e1', source: 'item:1', target: 'concept:1', weight: 1 },
    { id: 'e2', source: 'item:2', target: 'concept:1', weight: 0.5 },
    { id: 'e3', source: 'item:3', target: 'concept:2', weight: 0.2 },
  ],
  truncated: false,
}

function boxes(data: GraphData) {
  const positions = layoutGraph(data.nodes.map((n) => ({ id: n.id, ...nodeSize(n) })), data.edges)
  return data.nodes.map((n) => ({ ...positions[n.id], ...nodeSize(n) }))
}

describe('layoutGraph', () => {
  it('handles no nodes and one node', () => {
    expect(layoutGraph([], [])).toEqual({})
    expect(Object.keys(layoutGraph([{ id: 'a', width: 100, height: 40 }], []))).toEqual(['a'])
  })

  it('gives the same answer every time', () => {
    expect(boxes(sample)).toEqual(boxes(sample))
  })

  it('never produces NaN, even with edges pointing at missing nodes', () => {
    const odd = { ...sample, edges: [...sample.edges, { id: 'x', source: 'item:1', target: 'nope', weight: 1 }] }
    for (const box of boxes(odd)) {
      expect(Number.isFinite(box.x)).toBe(true)
      expect(Number.isFinite(box.y)).toBe(true)
    }
  })

  it('keeps nodes from overlapping', () => {
    const many: GraphData = {
      nodes: [...Array.from({ length: 12 }, (_, i) => item(i)), ...Array.from({ length: 8 }, (_, i) => concept(i))],
      edges: Array.from({ length: 12 }, (_, i) => ({
        id: `e${i}`, source: `item:${i}`, target: `concept:${i % 3}`, weight: 0.5,
      })),
      truncated: false,
    }
    const b = boxes(many)
    for (let i = 0; i < b.length; i++) {
      for (let j = i + 1; j < b.length; j++) {
        const apartX = Math.abs(b[i].x + b[i].width / 2 - (b[j].x + b[j].width / 2)) >= (b[i].width + b[j].width) / 2 - 1
        const apartY = Math.abs(b[i].y + b[i].height / 2 - (b[j].y + b[j].height / 2)) >= (b[i].height + b[j].height) / 2 - 1
        expect(apartX || apartY).toBe(true)
      }
    }
  })

  it('puts linked nodes closer than unlinked ones', () => {
    const b = boxes(sample)
    const centre = (i: number) => ({ x: b[i].x + b[i].width / 2, y: b[i].y + b[i].height / 2 })
    const dist = (i: number, j: number) => Math.hypot(centre(i).x - centre(j).x, centre(i).y - centre(j).y)
    expect(dist(0, 3)).toBeLessThan(dist(0, 4)) // item 1 is nearer its own concept than a stranger's
  })
})

describe('flow builders', () => {
  it('turns every graph node into a typed flow node', () => {
    const nodes = buildFlowNodes(sample)
    expect(nodes.map((n) => n.type)).toEqual(['item', 'item', 'item', 'concept', 'concept'])
    expect(nodes[0].data).toMatchObject({ label: 'Resource 1', sourceType: 'article' })
    expect(nodes[3].data).toMatchObject({ label: 'idea 1', count: 2 })
  })

  it('finds neighbours in both directions', () => {
    expect([...neighborsOf(sample, 'concept:1')].sort()).toEqual(['item:1', 'item:2'])
    expect([...neighborsOf(sample, 'item:3')]).toEqual(['concept:2'])
    expect(neighborsOf(sample, 'item:99').size).toBe(0)
  })

  it('lights up lines touching the selection and fades the rest', () => {
    const none = buildFlowEdges(sample, null)
    const picked = buildFlowEdges(sample, 'concept:1')
    expect(picked.find((e) => e.id === 'e1')?.style?.opacity).toBeGreaterThan(0.9)
    expect(picked.find((e) => e.id === 'e3')?.style?.opacity).toBeLessThan(0.1)
    expect(none.find((e) => e.id === 'e1')?.style?.opacity).toBeGreaterThan(none.find((e) => e.id === 'e3')?.style?.opacity as number)
  })
})