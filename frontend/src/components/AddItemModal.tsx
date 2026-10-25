import { AddItemForm } from './AddItemForm'
import { CloseIcon } from './Icons'
import type { Item } from '../types'

interface Props {
  isOpen: boolean
  onClose: () => void
  onCreated: (item: Item, existing: boolean) => void
}

export function AddItemModal({ isOpen, onClose, onCreated }: Props) {
  if (!isOpen) return null

  function handleCreated(item: Item, existing: boolean) {
    onCreated(item, existing)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-paper/80 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="w-full max-w-xl rounded-2xl border border-rule bg-panel p-6 shadow-2xl animate-settle motion-reduce:animate-none"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="modal-title" className="text-xl font-bold tracking-tight text-ink">
            Add to RabbitHole
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-lg p-1.5 text-ink-soft hover:bg-rule/40 hover:text-ink"
          >
            <CloseIcon className="size-5" />
          </button>
        </div>
        <AddItemForm onCreated={handleCreated} />
      </div>
    </div>
  )
}
