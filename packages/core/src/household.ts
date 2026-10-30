/** A household has 1..N members. Solo use is a household of one. */
export const ROLES = ['owner', 'adult', 'viewer'] as const
export type Role = (typeof ROLES)[number]

export interface Member {
  id: string
  name: string
  role: Role
}

export type Visibility =
  | { kind: 'household' }
  | { kind: 'private'; ownerId: string }
  | { kind: 'members'; ownerId: string; memberIds: readonly string[] }

export function isSolo(members: readonly Member[]): boolean {
  return members.length === 1
}

export function canManageMembers(member: Member): boolean {
  return member.role === 'owner'
}

export function canConnectSources(member: Member): boolean {
  return member.role === 'owner' || member.role === 'adult'
}

export function canSee(member: Member, visibility: Visibility): boolean {
  switch (visibility.kind) {
    case 'household':
      return true
    case 'private':
      return visibility.ownerId === member.id
    case 'members':
      return visibility.ownerId === member.id || visibility.memberIds.includes(member.id)
  }
}

/** Validate a member list: at least one member and exactly one owner. */
export function validateMembers(members: readonly Member[]): string[] {
  const errors: string[] = []
  if (members.length === 0) errors.push('A household needs at least one member')
  const owners = members.filter((m) => m.role === 'owner').length
  if (members.length > 0 && owners !== 1) errors.push('A household needs exactly one owner')
  const ids = new Set(members.map((m) => m.id))
  if (ids.size !== members.length) errors.push('Member ids must be unique')
  return errors
}
