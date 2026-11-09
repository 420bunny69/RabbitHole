import { createContext } from 'react'

/** Selection dims unrelated nodes; search matches stay visibly emphasized. */
export type Focus = {
  selectedId: string | null
  related: ReadonlySet<string>
  matching: ReadonlySet<string>
  searching: boolean
}

export const FocusContext = createContext<Focus>({
  selectedId: null,
  related: new Set(),
  matching: new Set(),
  searching: false,
})

export function nodeFocusState(id: string, focus: Focus) {
  const matched = focus.searching && focus.matching.has(id)
  const relatedToSelection = focus.selectedId === id || focus.related.has(id)
  return {
    faded: focus.selectedId !== null
      ? !relatedToSelection && !matched
      : focus.searching && !matched,
    matched,
  }
}
