import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { LogoMark } from './Icons'

export function AuthPanel({
  title,
  children,
  footer,
}: {
  title: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-5 py-10 text-ink">
      <section className="w-full max-w-md rounded-lg border border-rule bg-panel p-6 shadow-xl sm:p-8">
        <Link to="/" className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-ink">
          <LogoMark className="size-6 text-burrow" />
          RabbitHole
        </Link>
        <h1 className="text-2xl font-bold">{title}</h1>
        <div className="mt-6">{children}</div>
        <div className="mt-6 border-t border-rule pt-5 text-sm text-ink-soft">{footer}</div>
      </section>
    </main>
  )
}