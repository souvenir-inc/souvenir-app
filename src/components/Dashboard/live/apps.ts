import type { AttachedConnection } from '@/lib/api/warehouse'
import type { App, AppId } from '../types'

/** The connections a warehouse reads, in the order it lists them, and which categories each fills. */
export class Apps {
  readonly list: App[]
  private readonly connections: Map<AppId, AttachedConnection>

  constructor(connections: AttachedConnection[]) {
    this.connections = new Map(connections.map((c) => [c.connectionId, c]))
    this.list = connections.map((c) => ({ id: c.connectionId, slug: c.connectorSlug, name: c.name }))
  }

  get(id: AppId): App | undefined {
    return this.list.find((app) => app.id === id)
  }

  name(id: AppId): string {
    return this.get(id)?.name ?? 'An app'
  }

  /** Connections that fill a category. */
  feeding(category: string): AppId[] {
    return this.list
      .filter((app) => this.connections.get(app.id)?.feeds.some((f) => f.category === category && f.status !== 'not_applicable'))
      .map((app) => app.id)
  }

  /** Still on its first sync: no feed has landed yet (CR-22). */
  firstSync(id: AppId): boolean {
    const feeds = this.connections.get(id)?.feeds.filter((f) => f.status !== 'not_applicable') ?? []
    return feeds.length > 0 && feeds.every((f) => f.lastSyncedAt === null)
  }

  /** Workspace order, for sorting. */
  rank(id: AppId): number {
    return this.list.findIndex((app) => app.id === id)
  }
}
