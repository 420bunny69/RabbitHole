import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { GraphData } from '../../types'
import { GraphPanel } from './GraphPanel'

const data: GraphData = {
  nodes: [
    { id: 'item:1', type: 'item', label: 'Earth - Wikipedia', item_id: 'abc', source_type: 'article', url: 'https://en.wikipedia.org/wiki/Earth', count: null },
    { id: 'item:2', type: 'item', label: 'Plate tectonics', item_id: 'def', source_type: 'article', url: null, count: null },
    { id: 'concept:1', type: 'concept', label: 'tectonics', item_id: null, source_type: null, url: null, count: 2 },
    { id: 'concept:2', type: 'concept', label: 'oceans', item_id: null, source_type: null, url: null, count: 1 },
  ],
  edges: [
    { id: 'e1', source: 'item:1', target: 'concept:1', weight: 1 },
    { id: 'e2', source: 'item:2', target: 'concept:1', weight: 1 },
    { id: 'e3', source: 'item:1', target: 'concept:2', weight: 0.4 },
  ],
  truncated: false,
}

const renderPanel = (selectedId: string | null, onFocus = vi.fn()) => {
  render(<MemoryRouter><GraphPanel data={data} selectedId={selectedId} onFocus={onFocus} /></MemoryRouter>)
  return onFocus
}

describe('GraphPanel', () => {
  it('explains the graph when nothing is selected', () => {
    renderPanel(null)
    expect(screen.getByText(/explore the connections/i)).toBeInTheDocument()
    expect(screen.getByText(/1 shared concept links your 2 resources/i)).toBeInTheDocument()
  })

  it('links a selected resource to its page and lists its concepts', async () => {
    const onFocus = renderPanel('item:1')
    expect(screen.getByRole('link', { name: /open resource/i })).toHaveAttribute('href', '/items/abc')
    expect(screen.getByText('en.wikipedia.org')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /tectonics/i }))
    expect(onFocus).toHaveBeenCalledWith('concept:1')
  })

  it('lists the resources that share a selected concept', () => {
    renderPanel('concept:1')
    expect(screen.getByText('Shared by 2 resources')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /earth - wikipedia/i })).toHaveAttribute('href', '/items/abc')
    expect(screen.getByRole('link', { name: /plate tectonics/i })).toHaveAttribute('href', '/items/def')
  })

  it('says so when a concept is used by one resource only', () => {
    renderPanel('concept:2')
    expect(screen.getByText('Used by 1 resource')).toBeInTheDocument()
    expect(screen.getByText(/start to connect them/i)).toBeInTheDocument()
  })
})