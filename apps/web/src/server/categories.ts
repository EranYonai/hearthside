import {
  CATEGORIES,
  CUSTOM_PREFIX,
  MAX_CUSTOM_CATEGORIES,
  categorySet,
  isCategoryIcon,
  type CategoryIconName,
  type CategorySet,
  type CustomCategory,
} from '@hearthside/core'
import type { MemberRow } from '@hearthside/db'
import { schema } from '@hearthside/db'
import { and, asc, eq, sql } from 'drizzle-orm'
import { audit, AuthError } from './repo'
import { randomToken } from './tokens'

const { householdCategories, transactions, categoryRules } = schema

type Conn = Parameters<typeof audit>[0]

export interface CategoryInput {
  label: string
  icon: CategoryIconName
  direction: 'out' | 'in'
  keywords: readonly string[]
}

export async function listCustomCategories(
  db: Conn,
  householdId: string,
): Promise<CustomCategory[]> {
  const rows = await db
    .select()
    .from(householdCategories)
    .where(eq(householdCategories.householdId, householdId))
    .orderBy(asc(householdCategories.createdAt))
  return rows.map((r) => ({
    slug: r.slug,
    label: r.label,
    icon: isCategoryIcon(r.icon) ? r.icon : 'other',
    direction: r.direction,
    keywords: r.keywords,
  }))
}

/** Built-in plus the household's own categories. */
export async function householdCategorySet(db: Conn, householdId: string): Promise<CategorySet> {
  return categorySet(await listCustomCategories(db, householdId))
}

function assertEditor(member: Pick<MemberRow, 'role'>) {
  if (member.role !== 'owner' && member.role !== 'adult')
    throw new AuthError('not_allowed', 'Viewers can’t change categories')
}

/** Trim and check what a person typed. Throws AuthError with a message to show. */
export function cleanCategoryInput(input: CategoryInput): CategoryInput {
  const label = input.label.replace(/\s+/g, ' ').trim()
  if (!label) throw new AuthError('not_found', 'Give the category a name')
  if (label.length > 30) throw new AuthError('not_found', 'Names up to 30 characters, please')
  if (!isCategoryIcon(input.icon)) throw new AuthError('not_found', 'Pick an icon')
  if (input.direction !== 'out' && input.direction !== 'in')
    throw new AuthError('not_found', 'Pick money out or money in')
  const keywords = [
    ...new Set(
      input.keywords.map((k) => k.replace(/\s+/g, ' ').trim().toLowerCase()).filter(Boolean),
    ),
  ]
  if (keywords.length > 20) throw new AuthError('not_found', 'Up to 20 keywords, please')
  if (keywords.some((k) => k.length < 2 || k.length > 40))
    throw new AuthError('not_found', 'Keywords need 2 to 40 characters')
  if (CATEGORIES.some((c) => c.label.toLowerCase() === label.toLowerCase()))
    throw new AuthError('not_found', `“${label}” is already a category`)
  return { label, icon: input.icon, direction: input.direction, keywords }
}

async function assertLabelFree(db: Conn, householdId: string, label: string, except?: string) {
  const [clash] = await db
    .select({ slug: householdCategories.slug })
    .from(householdCategories)
    .where(
      and(
        eq(householdCategories.householdId, householdId),
        sql`lower(${householdCategories.label}) = lower(${label})`,
      ),
    )
  if (clash && clash.slug !== except)
    throw new AuthError('not_found', `“${label}” is already a category`)
}

export async function createCategory(db: Conn, member: MemberRow, input: CategoryInput) {
  assertEditor(member)
  const clean = cleanCategoryInput(input)
  const existing = await listCustomCategories(db, member.householdId)
  if (existing.length >= MAX_CUSTOM_CATEGORIES)
    throw new AuthError('not_found', `Up to ${MAX_CUSTOM_CATEGORIES} of your own categories`)
  await assertLabelFree(db, member.householdId, clean.label)
  const slug = `${CUSTOM_PREFIX}${randomToken(6)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')}`
  await db.insert(householdCategories).values({
    householdId: member.householdId,
    slug,
    label: clean.label,
    icon: clean.icon,
    direction: clean.direction,
    keywords: [...clean.keywords],
    createdBy: member.id,
  })
  // The name is the household's own text, so the log keeps only the slug.
  await audit(db, {
    householdId: member.householdId,
    memberId: member.id,
    action: 'category.created',
    detail: { slug },
  })
  return { slug }
}

async function getOwn(db: Conn, householdId: string, slug: string) {
  const [row] = await db
    .select()
    .from(householdCategories)
    .where(
      and(eq(householdCategories.householdId, householdId), eq(householdCategories.slug, slug)),
    )
  if (!row) throw new AuthError('not_found', 'That category isn’t here')
  return row
}

export async function updateCategory(
  db: Conn,
  member: MemberRow,
  slug: string,
  input: CategoryInput,
) {
  assertEditor(member)
  await getOwn(db, member.householdId, slug)
  const clean = cleanCategoryInput(input)
  await assertLabelFree(db, member.householdId, clean.label, slug)
  await db
    .update(householdCategories)
    .set({
      label: clean.label,
      icon: clean.icon,
      direction: clean.direction,
      keywords: [...clean.keywords],
    })
    .where(
      and(
        eq(householdCategories.householdId, member.householdId),
        eq(householdCategories.slug, slug),
      ),
    )
  await audit(db, {
    householdId: member.householdId,
    memberId: member.id,
    action: 'category.updated',
    detail: { slug },
  })
}

/**
 * Remove a household category. Its entries become uncategorized (and wait for the
 * categorizer again), and rules that pointed at it go away.
 */
export async function deleteCategory(db: Conn, member: MemberRow, slug: string) {
  assertEditor(member)
  await getOwn(db, member.householdId, slug)
  const run = async (tx: Conn) => {
    const cleared = await tx
      .update(transactions)
      .set({
        category: null,
        categorySource: null,
        categoryVia: null,
        categoryConfidence: null,
        categoryCheckedAt: null,
      })
      .where(and(eq(transactions.householdId, member.householdId), eq(transactions.category, slug)))
      .returning({ id: transactions.id })
    await tx
      .delete(categoryRules)
      .where(
        and(eq(categoryRules.householdId, member.householdId), eq(categoryRules.category, slug)),
      )
    await tx
      .delete(householdCategories)
      .where(
        and(
          eq(householdCategories.householdId, member.householdId),
          eq(householdCategories.slug, slug),
        ),
      )
    await audit(tx, {
      householdId: member.householdId,
      memberId: member.id,
      action: 'category.deleted',
      detail: { slug, cleared: cleared.length },
    })
    return { cleared: cleared.length }
  }
  return 'transaction' in db ? db.transaction(run) : run(db)
}
