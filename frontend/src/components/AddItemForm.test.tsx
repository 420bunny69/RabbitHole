import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { createItem } from '../api/items'
import { deferred, makeItem } from '../test/fixtures'
import { AddItemForm } from './AddItemForm'

vi.mock('../api/items', () => ({ createItem: vi.fn() }))

const createMock = vi.mocked(createItem)
const LONG_TEXT = 'Entropy measures disorder in a system. It never decreases in an isolated one.'

beforeEach(() => {
  vi.resetAllMocks()
})

function setup() {
  const onCreated = vi.fn()
  const user = userEvent.setup()
  render(<AddItemForm onCreated={onCreated} />)
  return { user, onCreated }
}

describe('saving a link', () => {
  it('cannot be submitted while empty', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('adds https:// for the visitor, clears the box and reports the new item', async () => {
    const item = makeItem({ status: 'pending' })
    createMock.mockResolvedValue({ item, existing: false })
    const { user, onCreated } = setup()

    await user.type(screen.getByLabelText('Link to save'), 'example.com/post')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(createMock).toHaveBeenCalledWith({ url: 'https://example.com/post' })
    expect(onCreated).toHaveBeenCalledWith(item, false)
    expect(screen.getByLabelText('Link to save')).toHaveValue('')
  })

  it('saves when Enter is pressed in the box', async () => {
    createMock.mockResolvedValue({ item: makeItem(), existing: false })
    const { user } = setup()
    await user.type(screen.getByLabelText('Link to save'), 'https://example.com/a{Enter}')
    expect(createMock).toHaveBeenCalledWith({ url: 'https://example.com/a' })
  })

  it('shows the reason when the server refuses the link, and keeps what was typed', async () => {
    createMock.mockRejectedValue(new ApiError(422, 'That URL points to a private or internal address'))
    const { user, onCreated } = setup()

    await user.type(screen.getByLabelText('Link to save'), 'http://127.0.0.1/admin')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('private or internal address')
    expect(screen.getByLabelText('Link to save')).toHaveValue('http://127.0.0.1/admin')
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('says so when the link was already saved', async () => {
    const item = makeItem()
    createMock.mockResolvedValue({ item, existing: true })
    const { user, onCreated } = setup()

    await user.type(screen.getByLabelText('Link to save'), 'https://example.com/post')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('status')).toHaveTextContent('already saved')
    expect(onCreated).toHaveBeenCalledWith(item, true)
  })

  it('shows progress and blocks a second click while saving', async () => {
    const pending = deferred<{ item: ReturnType<typeof makeItem>; existing: boolean }>()
    createMock.mockReturnValue(pending.promise)
    const { user } = setup()

    await user.type(screen.getByLabelText('Link to save'), 'https://example.com/slow')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(createMock).toHaveBeenCalledTimes(1)

    pending.resolve({ item: makeItem(), existing: false })
    expect(await screen.findByRole('button', { name: 'Save' })).toBeDisabled() // box was cleared
  })

  it('explains an unexpected failure in plain words', async () => {
    createMock.mockRejectedValue(new Error('boom'))
    const { user } = setup()
    await user.type(screen.getByLabelText('Link to save'), 'https://example.com/a')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.')
  })
})

describe('saving pasted text', () => {
  async function openTextMode(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Text' }))
  }

  it('needs enough text before it can be saved, and says how much', async () => {
    const { user } = setup()
    await openTextMode(user)
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()

    await user.type(screen.getByLabelText('Text to save'), 'too short')
    expect(save).toBeDisabled()
    expect(screen.getByText('Add at least 20 characters.')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Text to save'))
    await user.type(screen.getByLabelText('Text to save'), LONG_TEXT)
    expect(save).toBeEnabled()
  })

  it('sends the text with its optional title and clears both', async () => {
    createMock.mockResolvedValue({ item: makeItem({ source_type: 'text' }), existing: false })
    const { user, onCreated } = setup()
    await openTextMode(user)

    await user.type(screen.getByLabelText('Title (optional)'), '  Thermodynamics  ')
    await user.type(screen.getByLabelText('Text to save'), LONG_TEXT)
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(createMock).toHaveBeenCalledWith({ text: LONG_TEXT, title: 'Thermodynamics' })
    expect(onCreated).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('Text to save')).toHaveValue('')
    expect(screen.getByLabelText('Title (optional)')).toHaveValue('')
  })

  it('leaves the title out when it is blank', async () => {
    createMock.mockResolvedValue({ item: makeItem(), existing: false })
    const { user } = setup()
    await openTextMode(user)
    await user.type(screen.getByLabelText('Text to save'), LONG_TEXT)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(createMock).toHaveBeenCalledWith({ text: LONG_TEXT, title: undefined })
  })

  it('saves with Ctrl+Enter', async () => {
    createMock.mockResolvedValue({ item: makeItem(), existing: false })
    const { user } = setup()
    await openTextMode(user)
    await user.type(screen.getByLabelText('Text to save'), LONG_TEXT)
    await user.keyboard('{Control>}{Enter}{/Control}')
    expect(createMock).toHaveBeenCalledTimes(1)
  })

  it('clears old messages when switching between link and text', async () => {
    createMock.mockRejectedValue(new ApiError(422, 'Nope'))
    const { user } = setup()
    await user.type(screen.getByLabelText('Link to save'), 'https://example.com/a')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    await openTextMode(user)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
