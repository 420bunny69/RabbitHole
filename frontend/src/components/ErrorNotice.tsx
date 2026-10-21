interface Props {
  message: string
  onRetry?: () => void
}

/** A problem the visitor can read and act on. Announced to screen readers as it appears. */
export function ErrorNotice({ message, onRetry }: Props) {
  return (
    <div role="alert" className="flex items-start justify-between gap-4 rounded-lg bg-danger-soft px-4 py-3 text-danger">
      <p>{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="shrink-0 font-semibold underline underline-offset-4">
          Try again
        </button>
      )}
    </div>
  )
}
