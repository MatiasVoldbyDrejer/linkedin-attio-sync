import Link from 'next/link'
import { buttonVariants } from '@linkedin-sync/ui/components/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@linkedin-sync/ui/components/card'
import { cn } from '@linkedin-sync/ui/lib/utils'
import { ChevronRightIcon, NoteIcon, RefreshIcon, ServerIcon, UserSearchIcon } from '@/components/icons'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'

const FEATURES = [
  {
    icon: UserSearchIcon,
    title: 'Asks when you reply',
    description: 'Reply to someone on LinkedIn and a small card asks which Attio person the conversation belongs to.',
  },
  {
    icon: RefreshIcon,
    title: 'Sync any thread',
    description: 'Every conversation has a Sync to Attio button for the ones you want on file right away.',
  },
  {
    icon: NoteIcon,
    title: 'Notes that stay current',
    description: 'Each teammate gets their own note on the person, kept up to date as the conversation continues.',
  },
]

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 flex-col">
        <section className="px-4 pt-20 pb-16 text-center sm:px-6 sm:pt-28 sm:pb-24">
          <div className="mx-auto max-w-3xl">
            <p className="text-sm font-medium text-muted-foreground">For Chrome and Attio</p>
            <h1 className="mt-3 text-4xl leading-[1.08] font-semibold text-balance sm:text-6xl">
              Your LinkedIn conversations, on the right people in Attio.
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg text-pretty text-muted-foreground sm:text-xl">
              A Chrome extension that files the conversations you choose as notes in your team&apos;s Attio workspace. No
              copying, no pasting.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
              {/* a real link styled as the primary button; Base UI's render prop would add role="button" */}
              <Link href="/install" className={cn(buttonVariants({ size: 'lg' }), 'h-11 rounded-full px-6 text-base')}>
                Install the extension
              </Link>
              <Link
                href="/privacy"
                className="inline-flex items-center gap-0.5 rounded-sm text-base text-link underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                How your data is handled
                <ChevronRightIcon className="size-4" />
              </Link>
            </div>
          </div>
        </section>

        <section aria-labelledby="features-heading" className="flex-1 border-t border-border/60 bg-muted/40 px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-4xl">
            <h2 id="features-heading" className="text-center text-2xl font-semibold sm:text-3xl">
              Stays out of your way.
            </h2>
            <ul className="mt-10 grid gap-4 sm:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, description }) => (
                <li key={title}>
                  <Card className="h-full">
                    <CardHeader className="gap-2">
                      <span className="mb-2 flex size-9 items-center justify-center rounded-xl bg-muted text-foreground">
                        <Icon className="size-5" strokeWidth={1.75} />
                      </span>
                      <CardTitle className="text-base font-semibold">{title}</CardTitle>
                      <CardDescription className="leading-relaxed text-pretty">{description}</CardDescription>
                    </CardHeader>
                  </Card>
                </li>
              ))}
            </ul>
            <p className="mt-10 text-center text-sm text-balance text-muted-foreground">
              {/* inline so the icon wraps with the text on narrow screens */}
              <ServerIcon className="mr-1.5 inline size-4 align-[-3px]" />
              Runs on your team&apos;s own backend and Attio workspace.
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
