// These mirror the JSON that the FastAPI backend sends (see backend/app/schemas.py).

export type SourceType = 'article' | 'youtube' | 'github' | 'text'
export type ItemStatus = 'pending' | 'processing' | 'ready' | 'failed'

export interface Item {
  id: string
  source_type: SourceType
  url: string | null
  title: string | null
  summary: string | null
  status: ItemStatus
  error_message: string | null
  created_at: string // ISO 8601, always UTC
  /** The most relevant concept names. Only the list endpoint includes them. */
  concepts?: string[]
}

export interface Concept {
  name: string
  relevance: number // 0 to 1
}

export interface ItemDetail extends Omit<Item, 'concepts'> {
  raw_text: string | null
  concepts: Concept[]
}

export interface NewItem {
  url?: string
  text?: string
  title?: string
}
export interface GraphNode {
  id: string // "item:<uuid>" or "concept:<number>"
  type: 'item' | 'concept'
  label: string
  item_id: string | null // items only
  source_type: SourceType | null // items only
  url: string | null // items only
  count: number | null // concepts only: how many resources use it
}

export interface GraphEdge {
  id: string
  source: string // an item node id
  target: string // a concept node id
  weight: number // 0 to 1
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
  /** True when older resources were left out to keep the graph readable. */
  truncated: boolean
}