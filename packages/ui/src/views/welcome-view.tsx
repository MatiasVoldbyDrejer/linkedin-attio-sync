'use client'

import type { MeResponse } from '@linkedin-sync/core'
import { AlertCircleIcon, CheckIcon, ChevronRightIcon, ExternalLinkIcon } from 'lucide-react'
import type * as React from 'react'

import { Button } from '@linkedin-sync/ui/components/button'
import { Field, FieldDescription, FieldLabel } from '@linkedin-sync/ui/components/field'
import { Input } from '@linkedin-sync/ui/components/input'
import { Spinner } from '@linkedin-sync/ui/components/spinner'
import { cn } from '@linkedin-sync/ui/lib/utils'
import { AccountRows, AppIcon, Group, type UpdateInfo, UpdateBanner } from '@linkedin-sync/ui/views/shared'

export type WelcomeAccount =
  | {
      signedIn: false
      /** Why the user was signed out */
      notice?: string
      signingIn: boolean
      signInError: string | null
      onSignIn: () => void
    }
  | {
      signedIn: true
      me?: MeResponse
      update: UpdateInfo | null
      onSignOut: () => void
      /** Opens the review of recent conversations, offered while it isn't done */
      onOpenReview?: () => void
    }

export interface WelcomeViewProps {
  /** undefined until storage has been read */
  account: WelcomeAccount | undefined
  onOpenLinkedIn: () => void
  backend: {
    url: string
    onUrlChange: (url: string) => void
    onSubmit: () => void
    onReset: () => void
    result: { text: string; tone: 'muted' | 'error' } | null
  }
  className?: string
}

function Step({ n, done, title, children }: { n: number; done?: boolean; title: string; children: React.ReactNode }) {
  return (
    <li className="relative flex gap-4 px-5 py-5 not-last:after:absolute not-last:after:right-0 not-last:after:bottom-0 not-last:after:left-16 not-last:after:h-px not-last:after:bg-border/70">
      <span
        aria-hidden
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold tabular-nums',
          done ? 'bg-green-500 text-white' : 'bg-primary text-primary-foreground',
        )}
      >
        {done ? <CheckIcon className="size-4" strokeWidth={3} /> : n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
        <h2 className="text-[15px] leading-tight font-semibold tracking-tight">{title}</h2>
        {children}
      </div>
    </li>
  )
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>
}

function ErrorText({ text }: { text: string }) {
  return (
    <p role="alert" className="flex items-start gap-1.5 text-sm leading-snug text-destructive">
      <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" />
      {text}
    </p>
  )
}

function Account({ account }: { account: WelcomeAccount | undefined }) {
  if (!account) return null
  if (!account.signedIn) {
    return (
      <>
        {account.notice && <ErrorText text={account.notice} />}
        <div>
          <Button className="h-9 rounded-full px-4" disabled={account.signingIn} onClick={account.onSignIn}>
            {account.signingIn && <Spinner className="size-3.5" />}
            {account.signingIn ? 'Waiting for Attio…' : 'Sign in with Attio'}
          </Button>
        </div>
        {account.signInError && <ErrorText text={account.signInError} />}
      </>
    )
  }
  return (
    <>
      <Group className="bg-background ring-1 ring-border/60 dark:bg-foreground/[0.04]">
        <AccountRows me={account.me} />
      </Group>
      {account.update && <UpdateBanner update={account.update} />}
      <div className="flex flex-wrap items-center gap-2">
        {account.onOpenReview && account.me?.reviewStatus && account.me.reviewStatus !== 'done' && (
          <Button size="sm" className="rounded-full px-3" onClick={account.onOpenReview}>
            Choose which conversations sync
            <ChevronRightIcon data-icon="inline-end" className="size-3.5" />
          </Button>
        )}
        <Button variant="outline" size="sm" className="rounded-full" onClick={account.onSignOut}>
          Sign out
        </Button>
      </div>
    </>
  )
}

/** The options page, opened on install: a three-step setup. */
export function WelcomeView({ account, onOpenLinkedIn, backend, className }: WelcomeViewProps) {
  return (
    <main className={cn('min-h-svh bg-background font-sans text-foreground antialiased', className)}>
      <div className="mx-auto flex max-w-[560px] flex-col gap-10 px-6 py-16">
        <header className="flex flex-col items-center gap-4 text-center">
          <AppIcon className="size-16 shadow-md" />
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">LinkedIn → Attio</h1>
            <p className="mx-auto max-w-sm text-[15px] leading-relaxed text-balance text-muted-foreground">
              Syncs your LinkedIn conversations to people in your team’s Attio workspace.
            </p>
          </div>
        </header>

        <ol className="flex flex-col overflow-hidden rounded-2xl bg-muted">
          <Step n={1} done={account?.signedIn} title="Sign in with Attio">
            <Account account={account} />
          </Step>
          <Step n={2} title="Open LinkedIn">
            <Muted>The extension syncs in the background whenever Chrome is running and you’re logged in to LinkedIn.</Muted>
            <div>
              <Button variant="outline" className="h-9 rounded-full px-4" onClick={onOpenLinkedIn}>
                Open LinkedIn messaging
                <ExternalLinkIcon data-icon="inline-end" className="size-3.5" />
              </Button>
            </div>
          </Step>
          <Step n={3} title="Link conversations">
            <Muted>When you reply to someone, a card on LinkedIn asks which Attio person they are.</Muted>
            <Muted>
              On any conversation, <strong className="font-medium text-foreground">Sync to Attio</strong> links it or refreshes
              its note.
            </Muted>
          </Step>
        </ol>

        <details className="group">
          <summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded-md text-sm text-muted-foreground outline-none select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30 [&::-webkit-details-marker]:hidden">
            <ChevronRightIcon className="size-4 transition-transform duration-200 group-open:rotate-90" />
            Advanced
          </summary>
          <form
            className="mt-4 flex flex-col gap-4 rounded-2xl bg-muted p-5"
            onSubmit={(event) => {
              event.preventDefault()
              backend.onSubmit()
            }}
          >
            <Field>
              <FieldLabel htmlFor="backendUrl">Backend URL</FieldLabel>
              <Input
                id="backendUrl"
                name="backendUrl"
                type="url"
                required
                value={backend.url}
                onChange={(event) => backend.onUrlChange(event.currentTarget.value)}
                className="h-9 bg-background px-3 dark:bg-foreground/[0.06]"
              />
              <FieldDescription>Changing it signs you out. Leave the default unless you run your own backend.</FieldDescription>
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" className="h-9 rounded-full px-4">
                Use this backend
              </Button>
              <Button type="button" variant="outline" className="h-9 rounded-full px-4" onClick={backend.onReset}>
                Reset to default
              </Button>
            </div>
          </form>
          <p
            role="status"
            className={cn(
              'mt-3 px-1 text-sm',
              backend.result?.tone === 'error' ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {backend.result?.text}
          </p>
        </details>
      </div>
    </main>
  )
}
