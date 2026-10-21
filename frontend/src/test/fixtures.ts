import type { Item, ItemDetail } from '../types'

export function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: crypto.randomUUID(),
    source_type: 'article',
    url: 'https://example.com/post',
    title: 'Understanding Gradient Descent',
    summary: 'Gradient descent minimizes a function one small step at a time.',
    status: 'ready',
    error_message: null,
    created_at: new Date().toISOString(),
    concepts: ['gradient descent', 'learning rate'],
    ...overrides,
  }
}

export function makeDetail(overrides: Partial<ItemDetail> = {}): ItemDetail {
  const { concepts: _ignored, ...item } = makeItem()
  return {
    ...item,
    raw_text: 'Gradient descent is an optimization algorithm. The learning rate sets the step size.',
    concepts: [
      { name: 'gradient descent', relevance: 0.9 },
      { name: 'learning rate', relevance: 0.6 },
    ],
    ...overrides,
  }
}

/** A promise you resolve or reject yourself, for testing responses that arrive out of order. */
export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
