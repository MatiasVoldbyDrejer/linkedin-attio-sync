import type { Metadata } from 'next'
import Link from 'next/link'
import { LATEST_EXTENSION_VERSION } from '@linkedin-sync/core'
import { Badge } from '@linkedin-sync/ui/components/badge'
import { buttonVariants } from '@linkedin-sync/ui/components/button'
import { Card, CardContent, CardHeader, CardTitle } from '@linkedin-sync/ui/components/card'
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@linkedin-sync/ui/components/item'
import { cn } from '@linkedin-sync/ui/lib/utils'
import { AppIcon } from '@linkedin-sync/ui/views/shared'
import { ChevronRightIcon, DownloadIcon, RotateIcon, ShieldCheckIcon } from '@/components/icons'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'

export const metadata: Metadata = {
  title: 'Install',
  description: 'Set up the Chrome extension that syncs your LinkedIn conversations to Attio.',
}

const DOWNLOAD_URL = '/extension/linkedin-attio-sync.zip'

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">{children}</code>
}

const STEPS = [
  {
    title: 'Unzip the download',
    body: <>Keep the folder somewhere permanent, like Documents. Chrome runs the extension from it, so don&apos;t delete it.</>,
  },
  {
    title: 'Load it in Chrome',
    body: (
      <>
        Open <Code>chrome://extensions</Code>, turn on <strong className="font-medium text-foreground">Developer mode</strong>{' '}
        (top right), click <strong className="font-medium text-foreground">Load unpacked</strong> and pick the unzipped folder.
      </>
    ),
  },
  {
    title: 'Sign in with Attio',
    body: (
      <>
        A welcome page opens. Click <strong className="font-medium text-foreground">Sign in with Attio</strong> and approve,
        using your account in your team&apos;s workspace.
      </>
    ),
  },
  {
    title: 'Open LinkedIn messaging',
    body: (
      <>
        Go to{' '}
        <a href="https://www.linkedin.com/messaging/" className="text-link">
          linkedin.com/messaging
        </a>
        . Conversations you reply to ask which
        Attio person they belong to, and any thread has a <strong className="font-medium text-foreground">Sync to Attio</strong>{' '}
        button.
      </>
    ),
  },
]

export default function InstallPage() {
  return (
    <>
      <SiteHeader current="/install" />
      <main className="flex-1 bg-muted/40">
        <div className="mx-auto max-w-3xl px-4 pt-14 pb-20 sm:px-6 sm:pt-20">
          <div className="text-center">
            <h1 className="text-4xl font-semibold text-balance sm:text-5xl">Install the extension</h1>
            <p className="mx-auto mt-4 max-w-xl text-lg text-pretty text-muted-foreground">
              A couple of minutes in Chrome, then the conversations you choose land on the right people in Attio.
            </p>
          </div>

          <Card className="mt-10">
            <CardContent className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
              <AppIcon className="size-14" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  <h2 className="text-lg font-semibold">LinkedIn → Attio Sync</h2>
                  <Badge variant="secondary" className="tabular-nums">
                    v{LATEST_EXTENSION_VERSION}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">Chrome extension, unpacked build (.zip)</p>
              </div>
              <a
                href={DOWNLOAD_URL}
                download
                className={cn(buttonVariants({ size: 'lg' }), 'h-10 w-full gap-2 rounded-full px-5 sm:w-auto')}
              >
                <DownloadIcon />
                Download
              </a>
            </CardContent>
          </Card>

          <section aria-labelledby="setup-heading" className="mt-14">
            <h2 id="setup-heading" className="px-1 text-2xl font-semibold">
              Set it up
            </h2>
            <Card className="mt-4 gap-0 py-2">
              <ol className="divide-y divide-border/60">
                {STEPS.map((step, index) => (
                  <Item key={step.title} render={<li />} className="items-start rounded-none px-5 py-4 sm:px-6">
                    <ItemMedia className="size-7 rounded-full bg-muted text-sm font-semibold text-foreground tabular-nums">
                      {index + 1}
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle className="text-base font-semibold">{step.title}</ItemTitle>
                      <ItemDescription className="line-clamp-none leading-relaxed text-pretty">{step.body}</ItemDescription>
                    </ItemContent>
                  </Item>
                ))}
              </ol>
            </Card>
          </section>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="flex items-center gap-3">
                <span className="flex size-8 items-center justify-center rounded-lg bg-muted">
                  <RotateIcon strokeWidth={1.75} />
                </span>
                <CardTitle className="text-base font-semibold">Updating</CardTitle>
              </CardHeader>
              <CardContent className="leading-relaxed text-pretty text-muted-foreground">
                Download the new version and replace the old folder with it. Then click the reload arrow on the extension in{' '}
                <Code>chrome://extensions</Code> and hard-refresh open LinkedIn tabs (⌘⇧R). Tabs you don&apos;t refresh keep
                running the old version.
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex items-center gap-3">
                <span className="flex size-8 items-center justify-center rounded-lg bg-muted">
                  <ShieldCheckIcon strokeWidth={1.75} />
                </span>
                <CardTitle className="text-base font-semibold">What it stores</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3 leading-relaxed text-pretty text-muted-foreground">
                <p>
                  It reads your own LinkedIn inbox through your signed-in session and never posts or sends anything. Only
                  conversations you link become notes, visible to your team&apos;s Attio workspace.
                </p>
                <Link
                  href="/privacy"
                  className="mt-auto inline-flex w-fit items-center gap-0.5 rounded-sm text-link underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  Read the privacy policy
                  <ChevronRightIcon className="size-3.5" />
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
