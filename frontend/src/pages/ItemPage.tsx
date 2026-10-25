import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toApiError } from '../api/client'
import { getRelatedItems, updateNotes } from '../api/items'
import { ConceptList } from '../components/ConceptList'
import { ErrorNotice } from '../components/ErrorNotice'
import { BackIcon, CheckIcon, ExternalIcon, NoteIcon } from '../components/Icons'
import { SourceLabel } from '../components/SourceLabel'
import { StatusDot } from '../components/StatusNode'
import { useItem } from '../hooks/useItem'
import { recordItemVisit } from '../lib/recent'
import { isActive, statusMessage } from '../lib/status'
import { relativeTime } from '../lib/time'
import { displayHost, displayLocation } from '../lib/url'
import type { RelatedItem } from '../types'
import { NotFound } from './NotFound'

export function ItemPage() {
  const { id } = useParams()
  if (!id) return <NotFound />
  // Keyed by id so that opening a different item always starts from a clean state.
  return <ItemView key={id} id={id} />
}

function BackLink() {
  return (
    <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-accent">
      <BackIcon className="size-4" />
      Your library
    </Link>
  )
}

function ItemView({ id }: { id: string }) {
  const navigate = useNavigate()
  const { item, error, stalled, retry, remove } = useItem(id)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // Personal notes state
  const [notesText, setNotesText] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [notesSuccess, setNotesSuccess] = useState(false)
  const [notesError, setNotesError] = useState<string | null>(null)

  // Related resources state
  const [related, setRelated] = useState<RelatedItem[]>([])
  const [loadingRelated, setLoadingRelated] = useState(false)

  const title = item ? (item.title ?? (item.url ? displayLocation(item.url) : 'Pasted text')) : null
  useEffect(() => {
    document.title = title ? `${title} - RabbitHole` : 'RabbitHole'
    return () => {
      document.title = 'RabbitHole'
    }
  }, [title])

  // Sync notes when item loads
  useEffect(() => {
    if (item?.notes !== undefined && item?.notes !== null) {
      setNotesText(item.notes)
    }
    if (item) {
      try {
        recordItemVisit(item)
      } catch {}
    }
  }, [item])

  // Fetch related items when ready
  useEffect(() => {
    if (item && item.status === 'ready') {
      let active = true
      setLoadingRelated(true)
      try {
        const promise = getRelatedItems?.(item.id)
        if (promise && typeof promise.then === 'function') {
          promise
            .then((res) => {
              if (active && Array.isArray(res)) setRelated(res)
            })
            .catch(() => {})
            .finally(() => {
              if (active) setLoadingRelated(false)
            })
        } else {
          setLoadingRelated(false)
        }
      } catch {
        setLoadingRelated(false)
      }
      return () => {
        active = false
      }
    }
  }, [item?.id, item?.status])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setActionError(null)
    try {
      await action()
    } catch (caught) {
      setActionError(toApiError(caught).message)
      setBusy(false)
    }
  }

  function handleDelete() {
    if (!window.confirm("Delete this item? This can't be undone.")) return
    void run(async () => {
      await remove()
      navigate('/')
    })
  }

  async function handleSaveNotes() {
    if (!item) return
    setSavingNotes(true)
    setNotesError(null)
    setNotesSuccess(false)
    try {
      await updateNotes(item.id, notesText.trim() || null)
      setNotesSuccess(true)
      setTimeout(() => setNotesSuccess(false), 3000)
    } catch (caught) {
      setNotesError(toApiError(caught).message)
    } finally {
      setSavingNotes(false)
    }
  }

  if (error) {
    return (
      <div>
        <BackLink />
        <div className="mt-8">
          {error.status === 404 ? (
            <>
              <h1 className="text-3xl font-bold tracking-tight">We can't find that item</h1>
              <p className="mt-3 font-reading text-lg leading-relaxed text-ink-soft">
                It may have been deleted, or it was saved in a different browser.
              </p>
            </>
          ) : (
            <ErrorNotice message={error.message} />
          )}
        </div>
      </div>
    )
  }

  if (!item) {
    return (
      <div aria-busy="true">
        <BackLink />
        <div aria-hidden className="mt-8 animate-pulse space-y-4 motion-reduce:animate-none">
          <div className="h-10 w-3/4 rounded bg-rule/60" />
          <div className="h-4 w-1/3 rounded bg-rule/40" />
          <div className="h-24 rounded bg-rule/30" />
        </div>
      </div>
    )
  }

  return (
    <article className="max-w-3xl">
      <BackLink />
      <h1 className="mt-6 text-3xl sm:text-4xl leading-tight font-bold tracking-tight text-balance">
        {title}
      </h1>

      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-ink-soft text-sm">
        <SourceLabel type={item.source_type} />
        {item.url && <span>{displayHost(item.url)}</span>}
        <time dateTime={item.created_at} title={new Date(item.created_at).toLocaleString()}>
          Saved {relativeTime(item.created_at)}
        </time>
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-medium text-accent underline underline-offset-4"
          >
            Open original
            <ExternalIcon className="size-4" />
          </a>
        )}
      </p>

      {isActive(item.status) && (
        <div role="status" className="mt-10 flex items-center gap-3 text-lg text-ink-soft">
          <span className="grid place-items-center p-1">
            <StatusDot status={item.status} />
          </span>
          <span>{stalled ? 'This is taking longer than usual.' : statusMessage(item)}</span>
        </div>
      )}
      {stalled && (
        <p className="mt-2 text-ink-soft">If it does not finish, delete this item and save it again.</p>
      )}

      {item.status === 'failed' && (
        <div className="mt-10">
          <ErrorNotice message={statusMessage(item)} />
        </div>
      )}

      {item.status === 'ready' && (
        <>
          {/* AI Summary */}
          {item.summary && (
            <section className="mt-10" aria-labelledby="summary-heading">
              <h2 id="summary-heading" className="sr-only">
                Summary
              </h2>
              <div className="rounded-2xl border border-rule/80 bg-panel/70 p-6 shadow-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-accent mb-2 block">
                  AI Summary
                </span>
                <p className="max-w-[62ch] font-reading text-[1.15rem] leading-[1.7] text-ink">
                  {item.summary}
                </p>
              </div>
            </section>
          )}

          {/* Key Takeaways */}
          {item.takeaways && item.takeaways.length > 0 && (
            <section className="mt-8" aria-labelledby="takeaways-heading">
              <h2 id="takeaways-heading" className="text-sm font-semibold uppercase tracking-wider text-ink-soft mb-3">
                Key Takeaways
              </h2>
              <ul className="space-y-2.5 rounded-xl border border-rule/60 bg-panel/40 p-5">
                {item.takeaways.map((takeaway, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-sm font-reading leading-relaxed text-ink/90">
                    <span className="text-accent mt-0.5">&bull;</span>
                    <span>{takeaway}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Key Ideas / Concepts */}
          {item.concepts.length > 0 && (
            <section className="mt-8" aria-labelledby="concepts-heading">
              <h2 id="concepts-heading" className="mb-3 text-sm font-medium text-ink-soft">
                Key ideas
              </h2>
              <ConceptList names={item.concepts.map((concept) => concept.name)} />
            </section>
          )}

          {/* Personal Notes */}
          <section className="mt-10" aria-labelledby="notes-heading">
            <div className="flex items-center justify-between mb-3">
              <h2 id="notes-heading" className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-ink-soft">
                <NoteIcon className="size-4 text-accent" />
                Personal Notes
              </h2>
              {notesSuccess && (
                <span className="flex items-center gap-1 text-xs text-burrow">
                  <CheckIcon className="size-3.5" />
                  Notes saved
                </span>
              )}
            </div>
            <div className="rounded-xl border border-rule bg-panel/60 p-4">
              <textarea
                value={notesText}
                onChange={(e) => setNotesText(e.target.value)}
                placeholder="Write your personal thoughts, questions, or notes on this resource…"
                rows={4}
                className="w-full resize-y rounded-lg border border-rule/70 bg-paper/80 p-3 text-sm leading-relaxed text-ink placeholder:text-ink-soft/60 focus-visible:border-accent focus-visible:outline-none"
              />
              {notesError && <p className="mt-2 text-xs text-danger">{notesError}</p>}
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveNotes}
                  disabled={savingNotes}
                  className="rounded-lg bg-ink px-4 py-1.5 text-xs font-semibold text-paper hover:bg-ink/90 disabled:opacity-50"
                >
                  {savingNotes ? 'Saving…' : 'Save notes'}
                </button>
              </div>
            </div>
          </section>

          {/* Related Resources */}
          {related.length > 0 && (
            <section className="mt-10" aria-labelledby="related-heading">
              <h2 id="related-heading" className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-soft">
                Related Resources in Your Library
              </h2>
              <ul className="space-y-3">
                {related.map((rel) => (
                  <li key={rel.id} className="rounded-xl border border-rule/80 bg-panel/60 p-4 transition-all hover:border-accent/60">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <Link to={`/items/${rel.id}`} className="text-base font-semibold text-ink hover:text-accent">
                          {rel.title || 'Untitled'}
                        </Link>
                        <p className="mt-1 text-xs text-accent">
                          {rel.relationship_reason}
                        </p>
                        {rel.summary && (
                          <p className="mt-2 line-clamp-2 text-xs text-ink-soft leading-relaxed font-reading">
                            {rel.summary}
                          </p>
                        )}
                      </div>
                      <SourceLabel type={rel.source_type} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {loadingRelated && (
            <p className="mt-4 text-xs text-ink-soft">Discovering related resources…</p>
          )}
        </>
      )}

      {/* Extracted Text */}
      {item.raw_text && (
        <details className="mt-10 rounded-xl border border-rule bg-panel/40">
          <summary className="cursor-pointer px-5 py-3.5 text-sm font-medium text-ink">
            Extracted text ({item.raw_text.length.toLocaleString('en')} characters)
          </summary>
          <div className="max-h-96 overflow-auto px-5 pb-5 font-reading text-sm leading-relaxed whitespace-pre-wrap text-ink-soft">
            {item.raw_text}
          </div>
        </details>
      )}

      {actionError && (
        <div className="mt-8">
          <ErrorNotice message={actionError} />
        </div>
      )}

      {/* Actions */}
      <div className="mt-10 flex items-center gap-6 border-t border-rule pt-6">
        {item.status === 'failed' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(retry).then(() => setBusy(false))}
            className="rounded-lg bg-accent px-5 py-2.5 font-semibold text-on-accent hover:brightness-110 disabled:opacity-50"
          >
            Retry
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={handleDelete}
          className="font-semibold text-danger underline underline-offset-4 disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </article>
  )
}
