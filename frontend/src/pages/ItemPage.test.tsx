import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { deleteItem, getItem, retryItem } from '../api/items'
import { makeDetail, makeItem } from '../test/fixtures'
import { ItemPage } from './ItemPage'

vi.mock('../api/items', () => ({
  getItem: vi.fn(),
  retryItem: vi.fn(),
  deleteItem: vi.fn(),
  getRelatedItems: vi.fn().mockResolvedValue([]),
  updateNotes: vi.fn().mockResolvedValue({}),
}))

const getMock = vi.mocked(getItem)

beforeEach(() => {
  vi.resetAllMocks()
})
afterEach(() => {
  vi.restoreAllMocks()
})

function setup() {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/items/abc']}>
      <Routes>
        <Route path="/" element={<p>Library page</p>} />
        <Route path="/items/:id" element={<ItemPage />} />
      </Routes>
    </MemoryRouter>,
  )
  return { user }
}

describe('ItemPage', () => {
  it('shows the summary, key ideas, original link and extracted text of a finished item', async () => {
    getMock.mockResolvedValue(makeDetail({ title: 'Understanding Gradient Descent', url: 'https://www.example.com/gd' }))
    setup()

    expect(await screen.findByRole('heading', { level: 1, name: 'Understanding Gradient Descent' })).toBeInTheDocument()
    expect(screen.getByText(/one small step at a time/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Key ideas' })).toBeInTheDocument()
    expect(screen.getByText('learning rate')).toBeInTheDocument()
    expect(screen.getByText('example.com')).toBeInTheDocument()

    const original = screen.getByRole('link', { name: /Open original/ })
    expect(original).toHaveAttribute('href', 'https://www.example.com/gd')
    expect(original).toHaveAttribute('target', '_blank')
    expect(original).toHaveAttribute('rel', expect.stringContaining('noopener'))

    expect(screen.getByText(/Extracted text \(\d+ characters\)/)).toBeInTheDocument()
    expect(document.title).toBe('Understanding Gradient Descent - RabbitHole')
  })

  it('shows progress instead of a summary while the item is processing', async () => {
    getMock.mockResolvedValue(makeDetail({ status: 'processing', summary: null, concepts: [], raw_text: null }))
    setup()
    expect(await screen.findByRole('status')).toHaveTextContent('Reading the page and summarizing it…')
    expect(screen.queryByText('Key ideas')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
  })

  it('explains a failure, keeps the extracted text, and retries on request', async () => {
    getMock.mockResolvedValue(
      makeDetail({ status: 'failed', summary: null, concepts: [], error_message: 'The AI service is busy right now' }),
    )
    vi.mocked(retryItem).mockResolvedValue(makeItem({ status: 'pending' }))
    const { user } = setup()

    expect(await screen.findByRole('alert')).toHaveTextContent('The AI service is busy right now')
    expect(screen.getByText(/Extracted text/)).toBeInTheDocument()

    getMock.mockResolvedValue(makeDetail({ status: 'processing', summary: null, concepts: [] }))
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(retryItem).toHaveBeenCalledWith('abc')
    expect(await screen.findByRole('status')).toHaveTextContent('summarizing')
  })

  it('says so when the item does not exist for this browser', async () => {
    getMock.mockRejectedValue(new ApiError(404, 'Item not found'))
    setup()
    expect(await screen.findByRole('heading', { name: "We can't find that item" })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Your library/ })).toBeInTheDocument()
  })

  it('shows other errors as they are', async () => {
    getMock.mockRejectedValue(new ApiError(0, "Can't reach the server. Check your connection and try again."))
    setup()
    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the server")
  })

  it('deletes after you confirm, then returns to the library', async () => {
    getMock.mockResolvedValue(makeDetail())
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(deleteItem).mockResolvedValue(undefined)
    const { user } = setup()

    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    expect(deleteItem).toHaveBeenCalledWith('abc')
    expect(await screen.findByText('Library page')).toBeInTheDocument()
  })

  it('does nothing if you cancel the delete', async () => {
    getMock.mockResolvedValue(makeDetail())
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { user } = setup()

    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    expect(deleteItem).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('shows why a delete did not work and stays on the page', async () => {
    getMock.mockResolvedValue(makeDetail())
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(deleteItem).mockRejectedValue(new ApiError(500, 'Something went wrong (error 500). Please try again.'))
    const { user } = setup()

    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('error 500')
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled()
  })
})
