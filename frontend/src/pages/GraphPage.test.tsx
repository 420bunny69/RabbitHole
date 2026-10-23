import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import * as graphApi from '../api/graph'
import { deferred } from '../test/fixtures'
import type { GraphData } from '../types'
import { GraphPage } from './GraphPage'

vi.mock('../api/graph')
// React Flow needs a real browser (it measures sizes); the browser run covers the drawing itself.
vi.mock('../components/graph/KnowledgeGraph', () => ({
  KnowledgeGraph: ({ data }: { data: GraphData }) => <div data-testid="graph">{data.nodes.length} nodes</div>,
}))

const getGraph = vi.mocked(graphApi.getGraph)

const node = (id: string, type: 'item' | 'concept') => ({
  id, type, label: id, item_id: type === 'item' ? id : null,
  source_type: type === 'item' ? ('article' as const) : null, url: null, count: type === 'concept' ? 2 : null,
})
const graph = (overrides: Partial<GraphData> = {}): GraphData => ({
  nodes: [node('item:1', 'item'), node('item:2', 'item'), node('concept:1', 'concept')],
  edges: [
    { id: 'e1', source: 'item:1', target: 'concept:1', weight: 1 },
    { id: 'e2', source: 'item:2', target: 'concept:1', weight: 1 },
  ],
  truncated: false,
  ...overrides,
})

const renderPage = () => render(<MemoryRouter><GraphPage /></MemoryRouter>)

beforeEach(() => vi.resetAllMocks())

describe('GraphPage', () => {
  it('shows a loading state, then the graph with counts', async () => {
    getGraph.mockResolvedValue(graph())
    renderPage()
    expect(screen.getByText(/loading your graph/i)).toBeInTheDocument()
    expect(await screen.findByTestId('graph')).toHaveTextContent('3 nodes')
    expect(screen.getByText(/2 resources · 1 concept$/)).toBeInTheDocument()
  })

  it('invites the visitor to save things when there is nothing yet', async () => {
    getGraph.mockResolvedValue(graph({ nodes: [], edges: [] }))
    renderPage()
    expect(await screen.findByText(/nothing to connect yet/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /go to your library/i })).toHaveAttribute('href', '/')
    expect(screen.queryByTestId('graph')).not.toBeInTheDocument()
  })

  it('shows an error and recovers when retried', async () => {
    getGraph.mockRejectedValueOnce(new ApiError(0, 'Could not reach the server.'))
    getGraph.mockResolvedValueOnce(graph())
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server.')
    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByTestId('graph')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('asks for shared concepts only when the box is ticked', async () => {
    getGraph.mockResolvedValue(graph())
    renderPage()
    await screen.findByTestId('graph')
    expect(getGraph).toHaveBeenLastCalledWith({ minItems: 1 })
    await userEvent.click(screen.getByRole('checkbox', { name: /shared concepts only/i }))
    await waitFor(() => expect(getGraph).toHaveBeenLastCalledWith({ minItems: 2 }))
  })

  it('explains when shared-only finds no connections', async () => {
    getGraph.mockResolvedValueOnce(graph())
    getGraph.mockResolvedValueOnce(graph({ nodes: [node('item:1', 'item')], edges: [] }))
    renderPage()
    await screen.findByTestId('graph')
    await userEvent.click(screen.getByRole('checkbox'))
    expect(await screen.findByText(/none of your resources share a concept/i)).toBeInTheDocument()
  })

  it('mentions when older resources were left out', async () => {
    getGraph.mockResolvedValue(graph({ truncated: true }))
    renderPage()
    expect(await screen.findByText(/most recent resources/i)).toBeInTheDocument()
  })

  it('ignores a slow answer that arrives after a newer one', async () => {
    const slow = deferred<GraphData>()
    getGraph.mockReturnValueOnce(slow.promise)
    getGraph.mockResolvedValueOnce(graph({ nodes: [node('item:9', 'item')], edges: [] }))
    renderPage()
    await userEvent.click(screen.getByRole('checkbox'))
    expect(await screen.findByTestId('graph')).toHaveTextContent('1 nodes')
    slow.resolve(graph())
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(screen.getByTestId('graph')).toHaveTextContent('1 nodes')
  })
})