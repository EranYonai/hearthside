'use client'

import { BRAND_IDS, brandOf, type BrandId } from '@hearthside/core'
import { useState } from 'react'
import { BrandLogoPicker } from '@/components/BrandLogoPicker'

const selectClass = 'min-h-11 w-full rounded-md border border-line bg-surface-2 px-3'
const GROUPS = [
  { kind: 'bank', label: 'Banks' },
  { kind: 'card', label: 'Cards' },
  { kind: 'broker', label: 'Investments' },
] as const

/** Logos for the banks, card companies and brokers this home uses, plus any other on request. */
export function LogoSettings(props: { inUse: BrandId[]; logos: Partial<Record<BrandId, string>> }) {
  const [extra, setExtra] = useState<BrandId[]>([])
  const shown = [
    ...new Set([...props.inUse, ...(Object.keys(props.logos) as BrandId[]), ...extra]),
  ].sort((a, b) => brandOf(a).label.localeCompare(brandOf(b).label))
  const others = BRAND_IDS.filter((id) => !shown.includes(id))
  return (
    <div className="grid gap-3">
      {shown.length > 0 ? (
        <ul className="grid gap-3">
          {shown.map((id) => (
            <li key={id}>
              <BrandLogoPicker brand={id} logo={props.logos[id]} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-caption text-ink-muted">
          Once you add accounts, their banks and card companies show up here.
        </p>
      )}
      {others.length > 0 && (
        <label className="grid gap-1">
          <span className="text-caption text-ink-muted">Add a logo for another one</span>
          <select
            className={selectClass}
            value=""
            onChange={(e) => e.target.value && setExtra([...extra, e.target.value as BrandId])}
          >
            <option value="">Choose…</option>
            {GROUPS.map((g) => (
              <optgroup key={g.kind} label={g.label}>
                {others
                  .filter((id) => brandOf(id).kind === g.kind)
                  .sort((a, b) => brandOf(a).label.localeCompare(brandOf(b).label))
                  .map((id) => (
                    <option key={id} value={id}>
                      {brandOf(id).label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}
