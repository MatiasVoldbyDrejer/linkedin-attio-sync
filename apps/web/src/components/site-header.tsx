import Link from 'next/link'
import { cn } from '@linkedin-sync/ui/lib/utils'
import { AppIcon } from '@linkedin-sync/ui/views/shared'

const NAV = [
  { href: '/install', label: 'Install' },
  { href: '/privacy', label: 'Privacy' },
] as const

// server-rendered, so each page says which nav entry it is instead of reading the pathname
export function SiteHeader({ current }: { current?: (typeof NAV)[number]['href'] }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-12 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-md text-sm font-semibold tracking-tight focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {/* the same tile as the extension's toolbar icon and side panel */}
          <AppIcon className="size-6 shadow-none" />
          LinkedIn → Attio Sync
        </Link>
        <nav aria-label="Main">
          <ul className="flex items-center gap-5 text-xs">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={current === item.href ? 'page' : undefined}
                  className={cn(
                    'rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
                    current === item.href && 'text-foreground',
                  )}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  )
}
