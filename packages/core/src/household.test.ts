import { describe, expect, it } from 'vitest'
import {
  canConnectSources,
  canManageMembers,
  canSee,
  isSolo,
  validateMembers,
  type Member,
} from './household'

const owner: Member = { id: 'a', name: 'A', role: 'owner' }
const adult: Member = { id: 'b', name: 'B', role: 'adult' }
const viewer: Member = { id: 'c', name: 'C', role: 'viewer' }

describe('household', () => {
  it('treats one member as solo', () => {
    expect(isSolo([owner])).toBe(true)
    expect(isSolo([owner, adult, viewer])).toBe(false)
  })

  it('gates actions by role', () => {
    expect(canManageMembers(owner)).toBe(true)
    expect(canManageMembers(adult)).toBe(false)
    expect(canConnectSources(adult)).toBe(true)
    expect(canConnectSources(viewer)).toBe(false)
  })

  it('applies visibility', () => {
    expect(canSee(viewer, { kind: 'household' })).toBe(true)
    expect(canSee(owner, { kind: 'private', ownerId: 'b' })).toBe(false)
    expect(canSee(adult, { kind: 'private', ownerId: 'b' })).toBe(true)
    const chosen = { kind: 'members', ownerId: 'b', memberIds: ['c'] } as const
    expect(canSee(viewer, chosen)).toBe(true)
    expect(canSee(adult, chosen)).toBe(true)
    expect(canSee(owner, chosen)).toBe(false)
  })

  it('validates member lists', () => {
    expect(validateMembers([owner])).toEqual([])
    expect(validateMembers([owner, adult, viewer])).toEqual([])
    expect(validateMembers([])).toEqual(['A household needs at least one member'])
    expect(validateMembers([adult])).toEqual(['A household needs exactly one owner'])
    expect(validateMembers([owner, { ...owner }])).toEqual([
      'A household needs exactly one owner',
      'Member ids must be unique',
    ])
  })
})
