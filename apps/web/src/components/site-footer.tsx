import Link from 'next/link'

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-muted/40">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>LinkedIn → Attio Sync · for your team&apos;s internal use</p>
        <nav aria-label="Footer">
          <ul className="flex items-center gap-2">
            <li>
              <Link href="/install" className="rounded-sm transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none">
                Install
              </Link>
            </li>
            <li aria-hidden="true">·</li>
            <li>
              <Link href="/privacy" className="rounded-sm transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none">
                Privacy
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  )
}
