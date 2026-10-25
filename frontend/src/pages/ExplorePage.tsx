import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getCuriosityTrail } from '../api/trails'
import { ErrorNotice } from '../components/ErrorNotice'
import { CheckIcon, ChevronRightIcon, CompassIcon, ExternalIcon } from '../components/Icons'
import { SourceLabel } from '../components/SourceLabel'
import { displayHost } from '../lib/url'
import type { Trail, TrailStep } from '../types'

export function ExplorePage() {
  const [trail, setTrail] = useState<Trail | null>(null)
  const [currentStepIdx, setCurrentStepIdx] = useState(0)
  const [exploredSteps, setExploredSteps] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function loadTrail() {
    setLoading(true)
    setError(null)
    getCuriosityTrail()
      .then((data) => {
        setTrail(data)
        setCurrentStepIdx(0)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Could not generate exploration trail.')
      })
      .finally(() => {
        setLoading(false)
      })
  }

  useEffect(() => {
    loadTrail()
  }, [])

  function markExplored(stepId: string) {
    setExploredSteps((prev) => new Set([...prev, stepId]))
    if (trail && currentStepIdx < trail.steps.length - 1) {
      setCurrentStepIdx((idx) => idx + 1)
    }
  }

  function skipStep() {
    if (trail && currentStepIdx < trail.steps.length - 1) {
      setCurrentStepIdx((idx) => idx + 1)
    }
  }

  const currentStep: TrailStep | undefined = trail?.steps[currentStepIdx]

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-3xl font-bold tracking-tight text-ink">
            <CompassIcon className="size-7 text-accent" />
            Curiosity Trails
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Explore interconnected threads through your saved resources and concepts.
          </p>
        </div>
        <button
          type="button"
          onClick={loadTrail}
          disabled={loading}
          className="rounded-xl border border-rule bg-panel px-4 py-2 text-xs font-semibold text-ink hover:border-accent hover:text-accent disabled:opacity-50 transition-colors shadow-sm"
        >
          {loading ? 'Discovering…' : 'Start New Trail'}
        </button>
      </div>

      {error && <ErrorNotice message={error} onRetry={loadTrail} />}

      {loading && (
        <div className="animate-pulse space-y-6">
          <div className="h-28 rounded-2xl border border-rule bg-panel/60" />
          <div className="h-56 rounded-2xl border border-rule bg-panel/40" />
        </div>
      )}

      {!loading && trail && trail.steps.length > 0 && (
        <div className="space-y-8">
          {/* Stepper Progress bar */}
          <div className="rounded-2xl border border-rule/80 bg-panel/70 p-5 shadow-sm">
            <h2 className="text-sm font-semibold tracking-tight text-ink mb-4">
              {trail.title}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              {trail.steps.map((step, idx) => {
                const isCurrent = idx === currentStepIdx
                const isExplored = exploredSteps.has(step.id)
                return (
                  <div key={step.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCurrentStepIdx(idx)}
                      className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-medium transition-all ${
                        isCurrent
                          ? 'bg-accent text-on-accent font-semibold ring-2 ring-accent/40 shadow-sm'
                          : isExplored
                            ? 'bg-burrow/20 text-burrow border border-burrow/30'
                            : 'bg-paper/80 border border-rule text-ink-soft hover:text-ink'
                      }`}
                    >
                      {isExplored ? (
                        <CheckIcon className="size-3.5" />
                      ) : (
                        <span className="size-3.5 rounded-full border border-current text-[10px] grid place-items-center">
                          {idx + 1}
                        </span>
                      )}
                      <span className="max-w-[130px] truncate">{step.title}</span>
                    </button>
                    {idx < trail.steps.length - 1 && (
                      <ChevronRightIcon className="size-3 text-ink-soft/40 shrink-0" />
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Active Step Card */}
          {currentStep && (
            <div className="rounded-2xl border border-rule bg-panel p-6 sm:p-8 shadow-md">
              <div className="flex items-center justify-between gap-4">
                <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent uppercase tracking-wider">
                  Step {currentStepIdx + 1} of {trail.steps.length} &bull; {currentStep.step_type}
                </span>
                {currentStep.source_type && (
                  <SourceLabel type={currentStep.source_type} />
                )}
              </div>

              <h3 className="mt-4 text-2xl font-bold tracking-tight text-ink">
                {currentStep.title}
              </h3>

              {currentStep.url && (
                <p className="mt-1 text-xs text-ink-soft">
                  {displayHost(currentStep.url)}
                </p>
              )}

              {/* Connecting rationale */}
              <div className="mt-6 rounded-xl border border-rule/70 bg-paper/70 p-4">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-accent block mb-1">
                  Why this step is connected
                </span>
                <p className="font-reading text-sm leading-relaxed text-ink/90">
                  {currentStep.connection_reason}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-rule/70 pt-6">
                <div className="flex items-center gap-3">
                  {currentStep.item_id && (
                    <Link
                      to={`/items/${currentStep.item_id}`}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-on-accent hover:brightness-110"
                    >
                      Open Resource
                      <ExternalIcon className="size-3.5" />
                    </Link>
                  )}
                  {currentStep.url && !currentStep.item_id && (
                    <a
                      href={currentStep.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-on-accent hover:brightness-110"
                    >
                      Visit External Link
                      <ExternalIcon className="size-3.5" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => markExplored(currentStep.id)}
                    className="flex items-center gap-1.5 rounded-xl border border-rule bg-paper px-4 py-2 text-xs font-medium text-ink hover:border-burrow hover:text-burrow transition-colors"
                  >
                    <CheckIcon className="size-3.5" />
                    {exploredSteps.has(currentStep.id) ? 'Explored' : 'Mark Explored & Continue'}
                  </button>
                </div>

                {currentStepIdx < trail.steps.length - 1 && (
                  <button
                    type="button"
                    onClick={skipStep}
                    className="text-xs text-ink-soft hover:text-ink underline underline-offset-4"
                  >
                    Skip step
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
