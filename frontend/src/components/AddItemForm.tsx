import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { ApiError } from '../api/client'
import { createItem } from '../api/items'
import { normalizeUserUrl } from '../lib/url'
import type { Item } from '../types'

export const MIN_TEXT_CHARS = 20

type Mode = 'link' | 'text'

interface Props {
  onCreated: (item: Item, existing: boolean) => void
}

const inputClass =
  'w-full rounded-lg border border-rule bg-paper px-4 py-3 text-lg placeholder:text-ink-soft/70 focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

export function AddItemForm({ onCreated }: Props) {
  const [mode, setMode] = useState<Mode>('link')
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const textTooShort = text.trim().length < MIN_TEXT_CHARS
  const canSubmit = !submitting && (mode === 'link' ? url.trim().length > 0 : !textTooShort)

  async function submit(event?: FormEvent) {
    event?.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    setNotice(null)
    try {
      const { item, existing } = await createItem(
        mode === 'link'
          ? { url: normalizeUserUrl(url) }
          : { text: text.trim(), title: title.trim() || undefined },
      )
      if (mode === 'link') setUrl('')
      else {
        setText('')
        setTitle('')
      }
      if (existing) setNotice('You already saved that link, so it is still where you left it.')
      onCreated(item, existing)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function saveOnCtrlEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) void submit()
  }

  function chooseMode(next: Mode) {
    setMode(next)
    setError(null)
    setNotice(null)
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-rule bg-panel p-4 sm:p-5">
      <div role="group" aria-label="What are you saving?" className="mb-4 inline-flex rounded-lg border border-rule p-0.5">
        {(['link', 'text'] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={mode === option}
            onClick={() => chooseMode(option)}
            className={`rounded-md px-3.5 py-1.5 text-sm font-semibold ${
              mode === option ? 'bg-ink text-paper' : 'text-ink-soft hover:text-ink'
            }`}
          >
            {option === 'link' ? 'Link' : 'Text'}
          </button>
        ))}
      </div>

      {mode === 'link' ? (
        <div className="flex flex-col gap-3 sm:flex-row">
          <label htmlFor="item-url" className="sr-only">
            Link to save
          </label>
          <input
            id="item-url"
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="Paste an article link"
            aria-describedby="add-hint"
            className={`${inputClass} sm:flex-1`}
          />
          <SaveButton disabled={!canSubmit} submitting={submitting} />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <label htmlFor="item-title" className="sr-only">
            Title (optional)
          </label>
          <input
            id="item-title"
            type="text"
            value={title}
            maxLength={500}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Title (optional)"
            className={inputClass}
          />
          <label htmlFor="item-text" className="sr-only">
            Text to save
          </label>
          <textarea
            id="item-text"
            rows={6}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={saveOnCtrlEnter}
            placeholder="Paste the text of an article, a note, a transcript…"
            aria-describedby="add-hint"
            className={`${inputClass} resize-y font-reading text-base leading-relaxed`}
          />
          <div className="flex justify-end">
            <SaveButton disabled={!canSubmit} submitting={submitting} />
          </div>
        </div>
      )}

      <p id="add-hint" className="mt-3 text-sm text-ink-soft">
        {mode === 'link'
          ? 'Articles and blog posts work now. YouTube and GitHub links are coming soon.'
          : text.trim().length > 0 && textTooShort
            ? `Add at least ${MIN_TEXT_CHARS} characters.`
            : 'Press Ctrl+Enter or Cmd+Enter to save.'}
      </p>
      {error && (
        <p role="alert" className="mt-3 text-danger">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-3 text-ink-soft">
          {notice}
        </p>
      )}
    </form>
  )
}

function SaveButton({ disabled, submitting }: { disabled: boolean; submitting: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="rounded-lg bg-accent px-6 py-3 text-lg font-semibold text-on-accent hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {submitting ? 'Saving…' : 'Save'}
    </button>
  )
}
