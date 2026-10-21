import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toApiError } from '../api/client'
import { ConceptList } from '../components/ConceptList'
import { ErrorNotice } from '../components/ErrorNotice'
import { BackIcon, ExternalIcon } from '../components/Icons'
import { SourceLabel } from '../components/SourceLabel'
import { StatusDot } from '../components/StatusNode'
import { useItem } from '../hooks/useItem'
import { isActive, statusMessage } from '../lib/status'
import { relativeTime } from '../lib/time'
import { displayHost, displayLocation } from '../lib/url'
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

  const title = item ? (item.title ?? (item.url ? displayLocation(item.url) : 'Pasted text')) : null
  useEffect(() => {
    document.title = title ? `${title} - RabbitHole` : 'RabbitHole'
    return () => {
      document.title = 'RabbitHole'
    }
  }, [title])

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
    <article>
      <BackLink />
      <h1 className="mt-6 text-4xl leading-tight font-bold tracking-tight text-balance">{title}</h1>

      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-ink-soft">
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
          <section className="mt-10" aria-labelledby="summary-heading">
            <h2 id="summary-heading" className="sr-only">
              Summary
            </h2>
            <p className="max-w-[62ch] font-reading text-[1.2rem] leading-[1.7]">{item.summary}</p>
          </section>

          {item.concepts.length > 0 && (
            <section className="mt-10" aria-labelledby="concepts-heading">
              <h2 id="concepts-heading" className="mb-3 text-sm font-medium text-ink-soft">
                Key ideas
              </h2>
              <ConceptList names={item.concepts.map((concept) => concept.name)} />
            </section>
          )}
        </>
      )}

      {item.raw_text && (
        <details className="mt-10 rounded-lg border border-rule">
          <summary className="cursor-pointer px-4 py-3 font-medium">
            Extracted text ({item.raw_text.length.toLocaleString('en')} characters)
          </summary>
          <div className="max-h-96 overflow-auto px-4 pb-4 font-reading leading-relaxed whitespace-pre-wrap text-ink-soft">
            {item.raw_text}
          </div>
        </details>
      )}

      {actionError && (
        <div className="mt-8">
          <ErrorNotice message={actionError} />
        </div>
      )}

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
