import { useState, type FormEvent } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { AddItemModal } from './AddItemModal'
import {
  ClockIcon,
  CloseIcon,
  CompassIcon,
  DocumentIcon,
  GraphIcon,
  LogoMark,
  MenuIcon,
  PlusIcon,
  SearchIcon,
  SparklesIcon,
  TagIcon,
} from './Icons'
import type { Item } from '../types'

interface NavItem {
  to: string
  label: string
  icon: typeof DocumentIcon
  end?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Library', icon: DocumentIcon, end: true },
  { to: '/graph', label: 'Knowledge Graph', icon: GraphIcon },
  { to: '/explore', label: 'Explore Trails', icon: CompassIcon },
  { to: '/ask', label: 'Ask RabbitHole', icon: SparklesIcon },
  { to: '/topics', label: 'Topics', icon: TagIcon },
  { to: '/recent', label: 'Recently Viewed', icon: ClockIcon },
]

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const [globalQuery, setGlobalQuery] = useState('')
  const navigate = useNavigate()
  const { user, signOut } = useAuth()

  function handleSearchSubmit(e: FormEvent) {
    e.preventDefault()
    if (globalQuery.trim()) {
      navigate(`/?q=${encodeURIComponent(globalQuery.trim())}`)
      setSidebarOpen(false)
    }
  }

  function handleItemCreated(item: Item) {
    navigate(`/items/${item.id}`)
  }

  async function handleSignOut() {
    setLogoutError('')
    try {
      const { error } = await signOut()
      if (error) {
        setLogoutError(error.message || 'Unable to sign out. Please try again.')
        return
      }
      navigate('/login', { replace: true })
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : 'Unable to sign out. Please try again.')
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-paper text-ink md:flex-row">
      {/* Mobile top navigation bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-rule bg-panel/95 px-4 py-3 backdrop-blur-md md:hidden">
        <Link to="/" className="inline-flex items-center gap-2.5 text-lg font-bold tracking-tight">
          <LogoMark className="size-6 text-burrow" />
          RabbitHole
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            aria-label="Add resource"
            className="flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1.5 text-xs font-semibold text-on-accent"
          >
            <PlusIcon className="size-4" />
            Add
          </button>
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
            className="rounded-lg p-2 text-ink-soft hover:bg-rule/40 hover:text-ink"
          >
            {sidebarOpen ? <CloseIcon className="size-5" /> : <MenuIcon className="size-5" />}
          </button>
        </div>
      </header>

      {/* Backdrop for mobile drawer */}
      {sidebarOpen && (
        <div
          role="presentation"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-paper/80 backdrop-blur-xs md:hidden"
        />
      )}

      {/* Persistent Sidebar (desktop) / Collapsible Drawer (mobile) */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-rule bg-panel transition-transform duration-200 ease-in-out md:static md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="flex h-16 items-center justify-between px-5 border-b border-rule/60">
          <Link
            to="/"
            onClick={() => setSidebarOpen(false)}
            className="inline-flex items-center gap-2.5 text-lg font-bold tracking-tight text-ink"
          >
            <LogoMark className="size-7 text-burrow" />
            <span>RabbitHole</span>
          </Link>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="rounded-md p-1.5 text-ink-soft hover:bg-rule/40 md:hidden"
          >
            <CloseIcon className="size-5" />
          </button>
        </div>

        {/* Action Button & Search */}
        <div className="px-4 pt-4 pb-2 space-y-3">
          <button
            type="button"
            onClick={() => {
              setModalOpen(true)
              setSidebarOpen(false)
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-all hover:brightness-110 active:scale-[0.99] shadow-sm"
          >
            <PlusIcon className="size-4" />
            Add Resource
          </button>

          <form onSubmit={handleSearchSubmit} className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-soft/70" />
            <input
              type="search"
              value={globalQuery}
              onChange={(e) => setGlobalQuery(e.target.value)}
              placeholder="Search library..."
              className="w-full rounded-lg border border-rule/80 bg-paper/70 py-1.5 pr-3 pl-9 text-xs placeholder:text-ink-soft/60 focus-visible:border-accent focus-visible:outline-none"
            />
          </form>
        </div>

        {/* Navigation links */}
        <nav aria-label="Main Navigation" className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-accent-soft text-accent'
                      : 'text-ink-soft hover:bg-rule/30 hover:text-ink'
                  }`
                }
              >
                <Icon className="size-4.5 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>

        {/* Signed-in account */}
        <div className="border-t border-rule/60 p-4">
          <div className="rounded-xl border border-rule/70 bg-paper/60 p-3 text-xs">
            <span className="block font-medium text-ink">Signed in</span>
            <span className="mt-1 block truncate text-ink-soft" title={user?.email ?? undefined}>
              {user?.email ?? 'Account'}
            </span>
            {logoutError && <p role="alert" className="mt-2 text-danger">{logoutError}</p>}
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="mt-3 w-full rounded-md border border-rule px-2.5 py-1.5 text-left font-medium text-ink-soft hover:bg-rule/40 hover:text-ink"
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 px-4 py-8 sm:px-8 lg:px-12 max-w-5xl mx-auto w-full">
          <Outlet />
        </main>
        <footer className="border-t border-rule/60 py-6 px-6 text-center text-xs text-ink-soft/70">
          RabbitHole &bull; AI-Powered Personal Knowledge Discovery
        </footer>
      </div>

      {/* Global Add Resource Modal */}
      <AddItemModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={handleItemCreated}
      />
    </div>
  )
}
