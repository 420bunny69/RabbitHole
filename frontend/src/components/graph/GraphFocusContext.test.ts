import { describe, expect, it } from 'vitest'
import { nodeFocusState, type Focus } from './GraphFocusContext'

const idleFocus: Focus = {
  selectedId: null,
  related: new Set(),
  matching: new Set(),
  searching: false,
}

describe('nodeFocusState', () => {
  it('keeps nodes visible when nothing is selected or searched', () => {
    expect(nodeFocusState('item:1', idleFocus)).toEqual({ faded: false, matched: false })
  })

  it('dims unrelated nodes while preserving the selected neighborhood', () => {
    const focus: Focus = { ...idleFocus, selectedId: 'item:1', related: new Set(['concept:1']) }
    expect(nodeFocusState('item:1', focus).faded).toBe(false)
    expect(nodeFocusState('concept:1', focus).faded).toBe(false)
    expect(nodeFocusState('item:2', focus).faded).toBe(true)
  })

  it('makes matching nodes distinct and dims non-matches during search', () => {
    const focus: Focus = { ...idleFocus, searching: true, matching: new Set(['concept:1']) }
    expect(nodeFocusState('concept:1', focus)).toEqual({ faded: false, matched: true })
    expect(nodeFocusState('item:1', focus)).toEqual({ faded: true, matched: false })
  })

  it('keeps selected connections visible while highlighting search matches', () => {
    const focus: Focus = {
      selectedId: 'item:1',
      related: new Set(['concept:1']),
      matching: new Set(['item:2']),
      searching: true,
    }
    expect(nodeFocusState('concept:1', focus).faded).toBe(false)
    expect(nodeFocusState('item:2', focus)).toEqual({ faded: false, matched: true })
    expect(nodeFocusState('item:3', focus).faded).toBe(true)
  })
})
