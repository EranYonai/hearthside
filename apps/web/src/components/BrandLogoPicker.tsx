'use client'

import { brandOf, type BrandId } from '@hearthside/core'
import { Button, Notice } from '@hearthside/ui'
import { ImageUp, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef } from 'react'
import { removeBrandLogoAction, setBrandLogoAction } from '@/app/accounts/actions'
import { AccountMark } from '@/components/AccountCard'
import { useAction } from '@/lib/use-action'

const SIZE = 96

/** Shrink any picture to a small square PNG, so what we store stays tiny. */
async function toSmallPng(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, SIZE / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, (SIZE - w) / 2, (SIZE - h) / 2, w, h)
  bitmap.close()
  return canvas.toDataURL('image/png')
}

/** Upload or remove the household's logo for one bank, card company or broker. */
export function BrandLogoPicker({
  brand,
  logo,
  compact = false,
}: {
  brand: BrandId
  logo?: string | null
  compact?: boolean
}) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const { pending, error, run } = useAction()
  const { label } = brandOf(brand)
  const done = () => router.refresh()
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <AccountMark name={label} provider={brand} logos={logo ? { [brand]: logo } : {}} />
        {!compact && <span className="min-w-0 flex-1 truncate text-body-strong">{label}</span>}
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          aria-label={`Logo for ${label}`}
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            run(async () => setBrandLogoAction(brand, await toSmallPng(file)), done)
          }}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          icon={<ImageUp aria-hidden />}
          onClick={() => input.current?.click()}
        >
          {logo ? 'Replace logo' : compact ? `Add a ${label} logo` : 'Add logo'}
        </Button>
        {logo && (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            icon={<X aria-hidden />}
            aria-label={`Remove the ${label} logo`}
            onClick={() => run(() => removeBrandLogoAction(brand), done)}
          >
            Remove
          </Button>
        )}
      </div>
      {error && <Notice tone="negative">{error}</Notice>}
    </div>
  )
}
