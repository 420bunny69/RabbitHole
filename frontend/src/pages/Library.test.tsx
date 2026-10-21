import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { createItem, listItems, retryItem } from '../api/items'
import { deferred, makeItem } from '../test/fixtures'
import type { Item } from '../types'
import { Library } from './Library'

vi.mock('../api/items', () => ({
  listItems: vi.fn(),
  createItem: vi.fn(),
  retryItem: vi.fn(),
}))

const listMock = vi.mocked(listItems)

beforeEach(() => {
  vi.resetAllMocks()
})

function setup() {
  const user = userEvent.setup()
  render(
    <MemoryRouter>
      <Library />
    </MemoryRouter>,
  )
  return { user }
}

describe('Library', () => {
  it('invites you to save something when the library is empty', async () => {
    listMock.mockResolvedValue([])
    setup()
    expect(await screen.findByText('Nothing saved yet')).toBeInTheDocument()
    expect(screen.queryByLabelText('Search your library')).not.toBeInTheDocument()
  })

  it('shows each item with its state, grouped under the day it was saved', async () => {
    listMock.mockResolvedValue([
      makeItem({ title: 'Ready article' }),
      makeItem({ title: 'Busy article', status: 'processing', summary: null, concepts: [] }),
      makeItem({ title: 'Broken article', status: 'failed', summary: null, error_message: 'The website returned an error (404)' }),
    ])
    setup()

    expect(await screen.findByRole('heading', { name: 'Today', level: 2 })).toBeInTheDocument()
    const rows = screen.getAllByRole('listitem').filter((li) => li.querySelector('h3'))
    expect(rows).toHaveLength(3)

    const ready = within(rows[0])
    expect(ready.getByRole('link', { name: 'Ready article' })).toHaveAttribute('href', expect.stringMatching(/^\/items\//))
    expect(ready.getByText(/one small step at a time/)).toBeInTheDocument()
    expect(ready.getByText('gradient descent')).toBeInTheDocument()
    expect(ready.getByText('Ready')).toBeInTheDocument() // screen-reader status text

    expect(within(rows[1]).getByText('Reading the page and summarizing it…')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Processing')).toBeInTheDocument()

    expect(within(rows[2]).getByText('The website returned an error (404)')).toBeInTheDocument()
    expect(within(rows[2]).getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('shows a readable title while a link is still being fetched', async () => {
    listMock.mockResolvedValue([
      makeItem({ title: null, url: 'https://www.example.com/blog/post', status: 'pending', summary: null, concepts: [] }),
    ])
    setup()
    expect(await screen.findByRole('link', { name: 'example.com/blog/post' })).toBeInTheDocument()
  })

  it('retries a failed item and shows it as processing straight away', async () => {
    const failed = makeItem({ title: 'Broken article', status: 'failed', summary: null, error_message: 'The AI service is busy' })
    listMock.mockResolvedValue([failed])
    vi.mocked(retryItem).mockResolvedValue({ ...failed, status: 'pending', error_message: null })
    const { user } = setup()

    await user.click(await screen.findByRole('button', { name: 'Retry' }))

    expect(retryItem).toHaveBeenCalledWith(failed.id)
    expect(await screen.findByText('Reading the page and summarizing it…')).toBeInTheDocument()
    expect(screen.queryByText('The AI service is busy')).not.toBeInTheDocument()
  })

  it('tells you when a retry could not be started', async () => {
    const failed = makeItem({ status: 'failed', summary: null, error_message: 'Failed once' })
    listMock.mockResolvedValue([failed])
    vi.mocked(retryItem).mockRejectedValue(new ApiError(409, 'Only failed items can be retried'))
    const { user } = setup()

    await user.click(await screen.findByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Only failed items can be retried')
  })

  it('puts a newly saved item at the top straight away', async () => {
    listMock.mockResolvedValue([makeItem({ title: 'Older article' })])
    const saved = makeItem({ title: 'Brand new article', status: 'pending', summary: null, concepts: [] })
    vi.mocked(createItem).mockResolvedValue({ item: saved, existing: false })
    const { user } = setup()

    await screen.findByText('Older article')
    await user.type(screen.getByLabelText('Link to save'), 'https://example.com/new')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      const titles = screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)
      expect(titles).toEqual(['Brand new article', 'Older article'])
    })
  })

  it('searches after you stop typing, and offers a way back when nothing matches', async () => {
    listMock.mockImplementation(async ({ q } = {}) => (q ? [] : [makeItem({ title: 'Gradient article' })]))
    const { user } = setup()
    await screen.findByText('Gradient article')

    await user.type(screen.getByLabelText('Search your library'), 'zebra')
    expect(await screen.findByText(/matches “zebra”/)).toBeInTheDocument()
    expect(listMock).toHaveBeenLastCalledWith({ q: 'zebra' })

    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(await screen.findByText('Gradient article')).toBeInTheDocument()
  })

  it('explains a failed load and lets you try again', async () => {
    listMock.mockRejectedValueOnce(new ApiError(0, "Can't reach the server. Check your connection and try again."))
    const { user } = setup()
    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the server")

    listMock.mockResolvedValue([makeItem({ title: 'Back again' })])
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Back again')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows loading placeholders until the first answer arrives', async () => {
    const pending = deferred<Item[]>()
    listMock.mockReturnValue(pending.promise)
    setup()
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(screen.queryByText('Nothing saved yet')).not.toBeInTheDocument()

    pending.resolve([])
    expect(await screen.findByText('Nothing saved yet')).toBeInTheDocument()
  })
})
