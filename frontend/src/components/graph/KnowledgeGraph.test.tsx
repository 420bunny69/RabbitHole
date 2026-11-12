import { act, fireEvent, render, screen } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GraphData } from '../../types'
import { KnowledgeGraph } from './KnowledgeGraph'

const { fitView, nodesInitialized } = vi.hoisted(() => ({
  fitView: vi.fn(),
  nodesInitialized: vi.fn(),
}))

vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>()
  return {
    ...actual,
    ReactFlow: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Background: () => null,
    Controls: () => null,
    Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    useNodesInitialized: nodesInitialized,
    useReactFlow: () => ({ fitView }),
  }
})

vi.mock('./GraphPanel', () => ({ GraphPanel: () => null }))

const data: GraphData = {
  nodes: [{
    id: 'item:1',
    type: 'item',
    label: 'Resource',
    item_id: 'resource-1',
    source_type: 'article',
    url: null,
    count: null,
  }],
  edges: [],
  truncated: false,
}

let observers: Array<{ callback: ResizeObserverCallback; disconnect: ReturnType<typeof vi.fn> }> = []
let frames: FrameRequestCallback[] = []
let orientationTarget: EventTarget
let orientationQuery: MediaQueryList
let isPortrait = true

beforeEach(() => {
  fitView.mockClear()
  nodesInitialized.mockReturnValue(true)
  observers = []
  frames = []
  isPortrait = true
  orientationTarget = new EventTarget()
  const mediaQuery = Object.assign(orientationTarget, {
    matches: true,
    media: '(orientation: portrait)',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  })
  Object.defineProperty(mediaQuery, 'matches', { get: () => isPortrait })
  orientationQuery = mediaQuery as MediaQueryList
  vi.stubGlobal('matchMedia', vi.fn(() => orientationQuery))
  vi.stubGlobal('ResizeObserver', class {
    private readonly disconnectMock = vi.fn()

    constructor(callback: ResizeObserverCallback) {
      observers.push({ callback, disconnect: this.disconnectMock })
    }

    observe() {}
    unobserve() {}
    disconnect() {
      this.disconnectMock()
    }
  })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback)
    return frames.length
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function flushFrame() {
  const callback = frames.shift()
  if (callback) act(() => callback(0))
}

function setCanvasSize(element: Element, width: number, height: number) {
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({
      width, height, top: 0, right: width, bottom: height, left: 0, x: 0, y: 0, toJSON: () => ({}),
    }),
  })
}

describe('KnowledgeGraph viewport', () => {
  it.each([360, 390, 430, 1280])('fits the canvas at %i px wide', (viewportWidth) => {
    const { container } = render(<KnowledgeGraph data={data} />)
    const canvas = container.querySelector('.knowledge-graph-canvas')
    expect(canvas).toBeInTheDocument()
    const width = viewportWidth < 640 ? viewportWidth - 32 : viewportWidth - 352
    setCanvasSize(canvas!, width, 400)

    flushFrame()

    expect(fitView).toHaveBeenCalledTimes(1)
    expect(fitView).toHaveBeenCalledWith({ duration: 350, padding: 0.22, maxZoom: 1.15, minZoom: 0.1 })
    expect(canvas).toHaveClass('min-h-[min(360px,58dvh)]')
    expect(canvas).toHaveClass('sm:min-h-[520px]')
    expect(canvas).toHaveClass('min-w-0')
  })

  it('fits when graph data arrives asynchronously', async () => {
    function AsyncGraph() {
      const [graphData, setGraphData] = useState<GraphData | null>(null)
      useEffect(() => {
        void Promise.resolve().then(() => setGraphData(data))
      }, [])
      return graphData ? <KnowledgeGraph data={graphData} /> : <p>Loading</p>
    }

    const { container } = render(<AsyncGraph />)
    expect(fitView).not.toHaveBeenCalled()

    await act(async () => {
      await Promise.resolve()
    })
    setCanvasSize(container.querySelector('.knowledge-graph-canvas')!, 358, 430)
    flushFrame()

    expect(fitView).toHaveBeenCalledTimes(1)
  })

  it('does not refit during ordinary canvas resizing, but refits after orientation changes', () => {
    const { container } = render(<KnowledgeGraph data={data} />)
    const canvas = container.querySelector('.knowledge-graph-canvas')!
    setCanvasSize(canvas, 358, 430)
    flushFrame()
    expect(fitView).toHaveBeenCalledTimes(1)

    act(() => {
      observers[0].callback([], {} as ResizeObserver)
      observers[0].callback([], {} as ResizeObserver)
    })
    flushFrame()
    expect(fitView).toHaveBeenCalledTimes(1)

    isPortrait = false
    act(() => orientationTarget.dispatchEvent(new Event('change')))
    flushFrame()
    expect(fitView).toHaveBeenCalledTimes(2)
  })

  it('keeps the manual Fit to View action working', () => {
    const { container } = render(<KnowledgeGraph data={data} />)
    setCanvasSize(container.querySelector('.knowledge-graph-canvas')!, 358, 430)
    flushFrame()
    expect(fitView).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Fit graph to view' }))
    expect(fitView).toHaveBeenCalledTimes(2)
  })

  it('waits for nodes to be measured before fitting', () => {
    nodesInitialized.mockReturnValue(false)
    render(<KnowledgeGraph data={data} />)
    expect(observers).toHaveLength(0)
    expect(fitView).not.toHaveBeenCalled()
  })
})
