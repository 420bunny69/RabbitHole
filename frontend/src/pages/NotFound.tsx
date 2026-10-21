import { Link } from 'react-router-dom'

export function NotFound() {
  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">That page doesn't exist</h1>
      <p className="mt-3 font-reading text-lg leading-relaxed text-ink-soft">
        Check the address, or go back to your saved items.
      </p>
      <Link to="/" className="mt-6 inline-block font-semibold text-accent underline underline-offset-4">
        Back to your library
      </Link>
    </div>
  )
}
