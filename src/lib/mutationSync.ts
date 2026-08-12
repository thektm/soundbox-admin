import { ApiError, api } from './api'
import type { Paginated } from './types'

export type EntityId = string | number
export type Identified = { id: EntityId }

export type PageSnapshot<T extends Identified> = {
  item: T | null
  index: number
  order: EntityId[]
}

export function pageSnapshot<T extends Identified>(page: Paginated<T> | null, id: EntityId): PageSnapshot<T> {
  const results = page?.results || []
  const index = results.findIndex(item => item.id === id)
  return {
    item: index >= 0 ? results[index] : null,
    index,
    order: results.map(item => item.id),
  }
}

function adjustCount<T>(page: Paginated<T>, delta: number): Paginated<T> {
  const next: Paginated<T> = { ...page, count: Math.max(0, page.count + delta) }
  if (typeof page.total_count === 'number') next.total_count = Math.max(0, page.total_count + delta)
  return next
}

export function removePaginatedItem<T extends Identified>(page: Paginated<T> | null, id: EntityId): Paginated<T> | null {
  if (!page) return page
  const index = page.results.findIndex(item => item.id === id)
  if (index < 0) return page
  const results = [...page.results]
  results.splice(index, 1)
  return { ...adjustCount(page, -1), results }
}

export function setPaginatedItem<T extends Identified>(
  page: Paginated<T> | null,
  item: T,
  options: { visible?: boolean; indexHint?: number } = {},
): Paginated<T> | null {
  if (!page) return page
  if (options.visible === false) return removePaginatedItem(page, item.id)

  const index = page.results.findIndex(current => current.id === item.id)
  if (index >= 0) {
    if (page.results[index] === item) return page
    const results = [...page.results]
    results[index] = item
    return { ...page, results }
  }

  const results = [...page.results]
  const rawIndex = options.indexHint ?? results.length
  const insertAt = Math.max(0, Math.min(rawIndex < 0 ? results.length : rawIndex, results.length))
  results.splice(insertAt, 0, item)
  return { ...adjustCount(page, 1), results }
}

/**
 * Applies an authoritative page response without adopting server reordering of rows that
 * were already visible. Existing surviving rows keep their current/pre-action relative order.
 * Rows that newly enter the page are inserted beside the closest server-order anchor, so page
 * fill after a delete and placement after a create are both correct without reshuffling survivors.
 * Existing row objects also stay untouched: exact entity reads own field reconciliation, so an older
 * page response cannot overwrite a newer mutation on another row.
 */
export function reconcilePaginatedStable<T extends Identified>(
  current: Paginated<T> | null,
  incoming: Paginated<T>,
  preferredOrder: EntityId[] = [],
): Paginated<T> {
  if (!current) return incoming

  const incomingById = new Map<EntityId, T>()
  incoming.results.forEach(item => incomingById.set(item.id, item))
  const currentById = new Map<EntityId, T>()
  current.results.forEach(item => currentById.set(item.id, item))

  const stableIds: EntityId[] = []
  const stableSeen = new Set<EntityId>()
  const keepStable = (id: EntityId) => {
    if (stableSeen.has(id) || !incomingById.has(id)) return
    stableSeen.add(id)
    stableIds.push(id)
  }
  preferredOrder.forEach(keepStable)
  current.results.forEach(item => keepStable(item.id))

  const resultIds = [...stableIds]
  const present = new Set(resultIds)
  const incomingIds = incoming.results.map(item => item.id)

  incomingIds.forEach((id, incomingIndex) => {
    if (present.has(id)) return

    let insertAt = -1
    for (let i = incomingIndex - 1; i >= 0; i -= 1) {
      const previousIndex = resultIds.indexOf(incomingIds[i])
      if (previousIndex >= 0) {
        insertAt = previousIndex + 1
        break
      }
    }
    if (insertAt < 0) {
      for (let i = incomingIndex + 1; i < incomingIds.length; i += 1) {
        const nextIndex = resultIds.indexOf(incomingIds[i])
        if (nextIndex >= 0) {
          insertAt = nextIndex
          break
        }
      }
    }
    if (insertAt < 0) insertAt = resultIds.length
    resultIds.splice(insertAt, 0, id)
    present.add(id)
  })

  const results = resultIds.map(id => currentById.get(id) ?? incomingById.get(id)).filter((item): item is T => item !== undefined)
  return { ...incoming, results }
}

type VerificationHandlers<T> = {
  found: (item: T) => void | Promise<void>
  missing: () => void | Promise<void>
  unavailable?: () => void | Promise<void>
}


function mutationValueMatches(actual: unknown, expected: unknown): boolean {
  const actualEmpty=actual == null || actual === ''
  const expectedEmpty=expected == null || expected === ''
  if(actualEmpty || expectedEmpty) return actualEmpty && expectedEmpty

  if(Array.isArray(actual) || Array.isArray(expected)) {
    if(!Array.isArray(actual) || !Array.isArray(expected) || actual.length!==expected.length) return false
    return actual.every((value,index)=>mutationValueMatches(value,expected[index]))
  }

  if(typeof actual==='boolean' || typeof expected==='boolean') return actual===expected
  if(typeof actual==='number' || typeof expected==='number') {
    const left=Number(actual);const right=Number(expected)
    return Number.isFinite(left)&&Number.isFinite(right)&&left===right
  }

  if(typeof actual==='string'&&typeof expected==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(actual.trim())&&/^\d{4}-\d{2}-\d{2}T/.test(expected.trim())) {
    const left=Date.parse(actual);const right=Date.parse(expected)
    if(Number.isFinite(left)&&Number.isFinite(right)) return left===right
  }
  return String(actual)===String(expected)
}


/** Compare only fields the admin actually intended to mutate, with light number/null normalization. */
export function mutationFieldsMatch<T extends object>(server: T, expected: T, fields: readonly string[]): boolean {
  const actualRecord = server as Record<string, unknown>
  const expectedRecord = expected as Record<string, unknown>
  return fields.every(field => mutationValueMatches(actualRecord[field],expectedRecord[field]))
}

export type VerificationOutcome = 'found' | 'missing' | 'unavailable' | 'superseded'

type VerificationOptions<T> = {
  /** Delay before each exact read. First read should normally remain 0. */
  pollDelaysMs?: number[]
  /** Stop polling once a present entity matches the expected post-mutation state. */
  stopWhenFound?: (item: T) => boolean
  /** Stop polling once 404 confirms an expected deletion. */
  stopOnMissing?: boolean
}

const verificationGeneration = new Map<string, number>()
const wait = (ms: number) => new Promise<void>(resolve => window.setTimeout(resolve, ms))

/**
 * Silent read-after-write reconciliation for mutation endpoints.
 *
 * - Applies the exact server entity immediately on every authoritative response.
 * - If the first read shows that an OK mutation did not persist yet, later reads keep watching
 *   quietly for a short window and apply the change as soon as it appears.
 * - A newer reconciliation for the same entity path supersedes the older one, preventing a stale
 *   background response from undoing a newer admin action.
 * - 404 is treated as authoritative absence; transient network/5xx failures are retried silently.
 */
export async function verifyExactEntity<T>(
  path: string,
  handlers: VerificationHandlers<T>,
  options: VerificationOptions<T> = {},
): Promise<VerificationOutcome> {
  const generation = (verificationGeneration.get(path) || 0) + 1
  verificationGeneration.set(path, generation)

  const watchesExpectedState = Boolean(options.stopWhenFound || options.stopOnMissing)
  const defaultDelays = watchesExpectedState ? [0, 350, 900, 1800] : [0, 350]
  const delays = (options.pollDelaysMs?.length ? options.pollDelaysMs : defaultDelays)
    .map(value => Math.max(0, Number(value) || 0))
  let lastAuthoritative: 'found' | 'missing' | null = null

  const isCurrent = () => verificationGeneration.get(path) === generation

  try {
    for (let index = 0; index < delays.length; index += 1) {
      if (delays[index] > 0) await wait(delays[index])
      if (!isCurrent()) return 'superseded'

      try {
        const item = await api<T>(path)
        if (!isCurrent()) return 'superseded'
        lastAuthoritative = 'found'
        await handlers.found(item)
        if (!options.stopWhenFound || options.stopWhenFound(item)) return 'found'
      } catch (error) {
        if (!isCurrent()) return 'superseded'
        if (error instanceof ApiError && error.status === 404) {
          lastAuthoritative = 'missing'
          await handlers.missing()
          if (!watchesExpectedState || options.stopOnMissing) return 'missing'
          continue
        }

        const transient = !(error instanceof ApiError) || error.status === 0 || error.status >= 500
        if (transient) continue
        break
      }
    }

    if (!isCurrent()) return 'superseded'
    if (lastAuthoritative) return lastAuthoritative
    await handlers.unavailable?.()
    return 'unavailable'
  } finally {
    if (verificationGeneration.get(path) === generation) verificationGeneration.delete(path)
  }
}
