import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listTopics } from '../api/topics'
import { ErrorNotice } from '../components/ErrorNotice'
import { SearchIcon, TagIcon } from '../components/Icons'
import { SourceLabel } from '../components/SourceLabel'
import { relativeTime } from '../lib/time'
import { displayHost } from '../lib/url'
import type { TopicDetail } from '../types'

export function TopicsPage() {
  const [topics, setTopics] = useState<TopicDetail[] | null>(null)
  const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function load() {
    setLoading(true)
    setError(null)
    listTopics()
      .then((data) => {
        setTopics(data)
        if (data.length > 0 && selectedTopicId === null) {
          setSelectedTopicId(data[0].id)
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Could not load topics.')
      })
      .finally(() => {
        setLoading(false)
      })
  }

  useEffect(() => {
    load()
  }, [])

  const filteredTopics = useMemo(() => {
    if (!topics) return []
    const q = search.trim().toLowerCase()
    if (!q) return topics
    return topics.filter((t) => t.name.toLowerCase().includes(q))
  }, [topics, search])

  const selectedTopic = useMemo(() => {
    if (!topics || selectedTopicId === null) return null
    return topics.find((t) => t.id === selectedTopicId) ?? null
  }, [topics, selectedTopicId])

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2.5 text-3xl font-bold tracking-tight text-ink">
          <TagIcon className="size-7 text-accent" />
          Topics
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          Browse concepts and tags extracted across your saved resources.
        </p>
      </div>

      {error && <ErrorNotice message={error} onRetry={load} />}

      {loading && (
        <div className="animate-pulse space-y-4">
          <div className="h-10 w-1/3 rounded-xl bg-rule/50" />
          <div className="h-64 rounded-2xl bg-panel/50" />
        </div>
      )}

      {!loading && topics && topics.length === 0 && (
        <div className="rounded-2xl border border-dashed border-rule p-12 text-center">
          <TagIcon className="mx-auto size-10 text-ink-soft/50" />
          <h2 className="mt-4 text-lg font-semibold text-ink">No topics extracted yet</h2>
          <p className="mt-1.5 text-sm text-ink-soft max-w-sm mx-auto">
            Save articles and text to your library. RabbitHole will automatically extract key concepts and organize them here.
          </p>
          <Link
            to="/"
            className="mt-6 inline-flex rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-on-accent"
          >
            Go to Library
          </Link>
        </div>
      )}

      {!loading && topics && topics.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Topics List / Filter Panel */}
          <div className="md:col-span-1 rounded-2xl border border-rule bg-panel p-4 flex flex-col h-[600px]">
            <div className="relative mb-3">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-soft/70" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter topics…"
                className="w-full rounded-lg border border-rule/80 bg-paper py-2 pr-3 pl-9 text-xs text-ink placeholder:text-ink-soft/60 focus-visible:border-accent focus-visible:outline-none"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {filteredTopics.map((topic) => {
                const isSelected = topic.id === selectedTopicId
                return (
                  <button
                    key={topic.id}
                    type="button"
                    onClick={() => setSelectedTopicId(topic.id)}
                    className={`flex w-full items-center justify-between rounded-xl px-3.5 py-2 text-left text-xs transition-colors ${
                      isSelected
                        ? 'bg-accent-soft text-accent font-semibold border border-accent/40'
                        : 'text-ink-soft hover:bg-rule/40 hover:text-ink border border-transparent'
                    }`}
                  >
                    <span className="truncate">{topic.name}</span>
                    <span className="ml-2 rounded-full bg-rule/50 px-2 py-0.5 text-[10px] text-ink-soft">
                      {topic.count}
                    </span>
                  </button>
                )
              })}
              {filteredTopics.length === 0 && (
                <p className="p-3 text-xs text-ink-soft text-center">No matching topics.</p>
              )}
            </div>
          </div>

          {/* Resources for Selected Topic */}
          <div className="md:col-span-2 rounded-2xl border border-rule bg-panel p-6 flex flex-col h-[600px] overflow-y-auto">
            {selectedTopic ? (
              <>
                <div className="border-b border-rule pb-4 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
                      Topic
                    </span>
                    <span className="text-xs text-ink-soft">
                      {selectedTopic.count} {selectedTopic.count === 1 ? 'resource' : 'resources'}
                    </span>
                  </div>
                  <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink">
                    {selectedTopic.name}
                  </h2>
                </div>

                <ul className="space-y-3">
                  {selectedTopic.items.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-xl border border-rule/70 bg-paper/60 p-4 transition-all hover:border-accent/60"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <Link
                            to={`/items/${item.id}`}
                            className="font-semibold text-sm text-ink hover:text-accent line-clamp-2"
                          >
                            {item.title || item.url || 'Untitled Resource'}
                          </Link>
                          {item.url && (
                            <span className="mt-0.5 block text-xs text-ink-soft">
                              {displayHost(item.url)}
                            </span>
                          )}
                          {item.summary && (
                            <p className="mt-2 line-clamp-2 text-xs font-reading text-ink-soft leading-relaxed">
                              {item.summary}
                            </p>
                          )}
                          <time className="mt-2 block text-[11px] text-ink-soft/70">
                            Saved {relativeTime(item.created_at)}
                          </time>
                        </div>
                        <SourceLabel type={item.source_type} />
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-ink-soft">
                Select a topic on the left to see connected resources.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
