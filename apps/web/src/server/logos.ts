import { BRAND_IDS, isBrandId, parseLogoDataUrl, type BrandId } from '@hearthside/core'
import type { MemberRow } from '@hearthside/db'
import { blindIndex, schema } from '@hearthside/db'
import { and, eq } from 'drizzle-orm'
import { audit, AuthError } from './repo'

const { brandLogos } = schema
type Conn = Parameters<typeof audit>[0]

export type BrandLogos = Partial<Record<BrandId, string>>

const keyOf = (id: BrandId) => blindIndex(`brand:${id}`)

/** The household's own logos, by brand id. */
export async function listBrandLogos(db: Conn, householdId: string): Promise<BrandLogos> {
  const rows = await db
    .select({ key: brandLogos.brandKey, image: brandLogos.image })
    .from(brandLogos)
    .where(eq(brandLogos.householdId, householdId))
  if (rows.length === 0) return {}
  const byKey = new Map(BRAND_IDS.map((id) => [keyOf(id), id]))
  const out: BrandLogos = {}
  for (const r of rows) {
    const id = byKey.get(r.key)
    if (id) out[id] = r.image
  }
  return out
}

function assertEditor(member: MemberRow) {
  if (member.role === 'viewer') throw new AuthError('not_allowed', 'Viewers can’t change logos')
}

export async function setBrandLogo(db: Conn, member: MemberRow, brand: string, image: string) {
  assertEditor(member)
  if (!isBrandId(brand)) throw new AuthError('not_allowed', 'Pick a bank, card company or broker')
  const logo = parseLogoDataUrl(image)
  if (!logo) throw new AuthError('not_allowed', 'Use a small PNG, JPEG or WebP image')
  const brandKey = keyOf(brand)
  await db
    .insert(brandLogos)
    .values({ householdId: member.householdId, brandKey, image: logo, createdBy: member.id })
    .onConflictDoUpdate({
      target: [brandLogos.householdId, brandLogos.brandKey],
      set: { image: logo, createdBy: member.id, createdAt: new Date() },
    })
  await audit(db, {
    householdId: member.householdId,
    memberId: member.id,
    action: 'logo.set',
    detail: {},
  })
}

export async function removeBrandLogo(db: Conn, member: MemberRow, brand: string) {
  assertEditor(member)
  if (!isBrandId(brand)) throw new AuthError('not_allowed', 'Pick a bank, card company or broker')
  await db
    .delete(brandLogos)
    .where(
      and(eq(brandLogos.householdId, member.householdId), eq(brandLogos.brandKey, keyOf(brand))),
    )
  await audit(db, {
    householdId: member.householdId,
    memberId: member.id,
    action: 'logo.removed',
    detail: {},
  })
}
