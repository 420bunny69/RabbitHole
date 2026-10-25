import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { askRabbitHole } from '../api/ask'
import { ErrorNotice } from '../components/ErrorNotice'
import { ExternalIcon, SparklesIcon } from '../components/Icons'
import { SourceLabel } from '../components/SourceLabel'
import { displayHost } from '../lib/url'
import type { AskResponse } from '../types'

const STARTER_PROMPTS = [
  'What are the core concepts and takeaways across my saved articles?',
  'What does my library say about optimization and machine learning?',
  'Summarize the key differences between the technologies in my notes.',
]

export function AskPage() {
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [response, setResponse] = useState<AskResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault()
    const q = question.trim()
    if (!q || loading) return

    setLoading(true)
    setError(null)
    try {
      const res = await askRabbitHole(q)
      setResponse(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not answer the question right now.')
    } finally {
      setLoading(false)
    }
  }

  function handlePromptClick(promptText: string) {
    setQuestion(promptText)
  }

  return (
    <div className="flex flex-col gap-8 max-w-3xl">
      {/* Page Header */}
      <div>
        <h1 className="flex items-center gap-2.5 text-3xl font-bold tracking-tight text-ink">
          <SparklesIcon className="size-7 text-accent" />
          Ask RabbitHole
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          Ask questions, synthesize insights, and retrieve specific details grounded strictly in your saved library.
        </p>
      </div>

      {/* Question Form */}
      <form onSubmit={handleSubmit} className="rounded-2xl border border-rule bg-panel p-5 shadow-sm">
        <label htmlFor="ask-input" className="block text-xs font-semibold uppercase tracking-wider text-ink-soft mb-2">
          Your Question
        </label>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            id="ask-input"
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask anything about your saved resources…"
            disabled={loading}
            className="flex-1 rounded-xl border border-rule/90 bg-paper px-4 py-3 text-sm text-ink placeholder:text-ink-soft/60 focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-on-accent transition-all hover:brightness-110 disabled:opacity-50"
          >
            {loading ? (
              <span>Analyzing…</span>
            ) : (
              <>
                <SparklesIcon className="size-4" />
                <span>Ask</span>
              </>
            )}
          </button>
        </div>

        {/* Starter suggestion chips */}
        <div className="mt-4 pt-3 border-t border-rule/50">
          <span className="text-[11px] font-medium text-ink-soft/80 block mb-2">
            Try asking:
          </span>
          <div className="flex flex-wrap gap-2">
            {STARTER_PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handlePromptClick(p)}
                className="rounded-lg border border-rule/70 bg-paper/60 px-3 py-1.5 text-xs text-ink-soft hover:border-accent hover:text-ink transition-colors text-left"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </form>

      {error && <ErrorNotice message={error} />}

      {/* Answer & Citations */}
      {response && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-rule/80 bg-panel/80 p-6 sm:p-8 shadow-md">
            <span className="text-xs font-semibold uppercase tracking-wider text-accent block mb-3">
              Synthesized Answer
            </span>
            <div className="font-reading text-base leading-relaxed text-ink whitespace-pre-wrap">
              {response.answer}
            </div>
          </div>

          {/* Citations list */}
          {response.citations.length > 0 && (
            <div className="rounded-2xl border border-rule/70 bg-panel/40 p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft mb-4">
                Cited Sources ({response.citations.length})
              </h2>
              <ul className="space-y-3">
                {response.citations.map((citation) => (
                  <li
                    key={citation.item_id}
                    className="rounded-xl border border-rule/70 bg-panel/70 p-4 transition-all hover:border-accent/60"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-accent/20 px-1.5 py-0.5 text-xs font-bold text-accent">
                            [{citation.citation_number}]
                          </span>
                          <Link
                            to={`/items/${citation.item_id}`}
                            className="font-semibold text-sm text-ink hover:text-accent"
                          >
                            {citation.title || 'Untitled Resource'}
                          </Link>
                        </div>
                        {citation.url && (
                          <span className="text-xs text-ink-soft mt-0.5 block">
                            {displayHost(citation.url)}
                          </span>
                        )}
                        <blockquote className="mt-2 text-xs font-reading italic text-ink-soft/90 pl-3 border-l-2 border-accent/40">
                          {citation.excerpt}
                        </blockquote>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <SourceLabel type={citation.source_type} />
                        <Link
                          to={`/items/${citation.item_id}`}
                          className="text-xs text-accent hover:underline flex items-center gap-1"
                        >
                          View
                          <ExternalIcon className="size-3" />
                        </Link>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
