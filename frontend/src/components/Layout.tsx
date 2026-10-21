import { Link, Outlet } from 'react-router-dom'
import { LogoMark } from './Icons'

export function Layout() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5">
      <header className="pt-8 pb-10">
        <Link to="/" className="inline-flex items-center gap-2.5 text-xl font-bold tracking-tight">
          <LogoMark className="size-7 text-burrow" />
          RabbitHole
        </Link>
      </header>
      <main className="flex-1 pb-20">
        <Outlet />
      </main>
      <footer className="border-t border-rule py-6 text-sm text-ink-soft">
        No account needed. Your library is tied to this browser, so clearing site data starts a new one.
      </footer>
    </div>
  )
}
