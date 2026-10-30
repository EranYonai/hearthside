import { buttonClasses, Card, Logo } from '@hearthside/ui'
import { Palette } from 'lucide-react'
import Link from 'next/link'
import { VersionTag } from '@/lib/VersionTag'

export default function Home() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-md place-content-center gap-6 px-4 py-8 text-center">
      <Logo size={96} className="mx-auto" />
      <div className="grid gap-2">
        <h1 className="font-display text-title">Hearthside</h1>
        <p className="text-ink-muted">One home, one clear picture.</p>
      </div>
      <Card className="text-start">
        <p>The foundation is in place. Sign-in and your home&apos;s overview come next.</p>
        <Link href="/design" className={`${buttonClasses('secondary')} justify-self-start`}>
          <Palette aria-hidden />
          Design system
        </Link>
      </Card>
      <footer className="pt-4 text-center">
        <VersionTag />
      </footer>
    </main>
  )
}
