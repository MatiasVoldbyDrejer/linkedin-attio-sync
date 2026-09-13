'use client'

import type { MeResponse, ReviewStatus, SyncHealth } from '@linkedin-sync/core'
import { AlertCircleIcon, AlertTriangleIcon, ChevronRightIcon, ClockIcon, ListChecksIcon, UsersIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@linkedin-sync/ui/components/button'
import { Spinner } from '@linkedin-sync/ui/components/spinner'
import { cn } from '@linkedin-sync/ui/lib/utils'
import { AccountRows, AppIcon, Group, Row, RowIcon, type UpdateInfo, UpdateBanner } from '@linkedin-sync/ui/views/shared'

export type SidePanelViewProps =
  | { status: 'loading' }
  | {
      status: 'signedOut'
      /** Why the user was signed out */
      notice?: string
      signingIn: boolean
      signInError: string | null
      onSignIn: () => void
    }
  | {
      status: 'signedIn'
      me?: MeResponse
      update: UpdateInfo | null
      health: SyncHealth | null
      lastSyncAt: number | null
      lastError: string | null
      pendingCount: number
      syncing: boolean
      onSyncNow: () => void
      onSignOut: () => void
      onOpenGuide: () => void
      /** The first-sign-in review of recent conversations; prompted until it's done */
      review?: { status: ReviewStatus; onOpen: () => void } | null
    }

function relativeTime(timestamp: number): string {
  const minutes = Math.round((Date.now() - timestamp) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  return hours < 24 ? `${hours} h ago` : new Date(timestamp).toLocaleString()
}

/** The panel can stay open for hours, so relative times need to keep moving. */
function useClockTick(intervalMs = 30_000) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((tick) => tick + 1), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
}

function statusLine(health: SyncHealth | null): { tone: string; text: string; detail?: string } {
  switch (health?.status) {
    case 'ok':
      return { tone: 'bg-green-500', text: 'Syncing' }
    case 'degraded':
      return { tone: 'bg-amber-500', text: 'Repairing automatically', detail: health.message }
    case 'auth_required':
      return { tone: 'bg-destructive', text: 'Log in to LinkedIn', detail: health.message }
    default:
      return { tone: 'bg-muted-foreground/40', text: 'Waiting for first sync' }
  }
}

/** Keeps content readable when the panel is dragged wide. */
const column = 'mx-auto w-full max-w-[420px]'

function TopBar({ subtitle }: { subtitle?: React.ReactNode }) {
  return (
    <header className="shrink-0 border-b border-border/60 px-4 py-3">
      <div className={cn(column, 'flex items-center gap-3')}>
        <AppIcon className="size-8" />
        <div className="flex min-w-0 flex-col">
          <h1 className="text-[15px] leading-tight font-semibold tracking-tight">LinkedIn → Attio</h1>
          {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
        </div>
      </div>
    </header>
  )
}

/** The extension's side panel: sign-in, or sync status with one primary action. Fills the height it's given. */
export function SidePanelView({ className, ...props }: SidePanelViewProps & { className?: string }) {
  useClockTick()
  return (
    <div className={cn('flex min-h-0 w-full flex-col bg-background font-sans text-foreground antialiased', className)}>
      <Body {...props} />
    </div>
  )
}

function Body(props: SidePanelViewProps) {
  if (props.status === 'loading') {
    return (
      <>
        <TopBar />
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="size-5 text-muted-foreground" />
        </div>
      </>
    )
  }

  if (props.status === 'signedOut') {
    return (
      // a centred welcome, like a wallet's unlock screen
      <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-10">
        <div className="flex w-full max-w-[320px] flex-col items-center gap-5 text-center">
          <AppIcon className="size-16" />
          <div className="flex flex-col gap-1.5">
            <h1 className="text-xl font-semibold tracking-tight">LinkedIn → Attio</h1>
            <p className="text-[13px] leading-snug text-pretty text-muted-foreground">
              Sign in with your Attio account to sync LinkedIn conversations to your team’s workspace.
            </p>
          </div>
          {props.notice && <Notice text={props.notice} />}
          <Button size="lg" className="h-10 w-full rounded-full text-sm" disabled={props.signingIn} onClick={props.onSignIn}>
            {props.signingIn && <Spinner className="size-3.5" />}
            {props.signingIn ? 'Waiting for Attio…' : 'Sign in with Attio'}
          </Button>
          {props.signInError && <Notice text={props.signInError} />}
        </div>
      </div>
    )
  }

  const status = statusLine(props.health)
  const pending = props.pendingCount
  return (
    <>
      <TopBar
        subtitle={
          <span className="flex items-center gap-1.5">
            <span aria-hidden className={cn('size-1.5 rounded-full', status.tone)} />
            {status.text}
          </span>
        }
      />

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className={cn(column, 'flex flex-col gap-4')}>
          {props.update && <UpdateBanner update={props.update} />}
          {props.review && props.review.status !== 'done' && <ReviewPrompt review={props.review} />}

          <Group>
            {status.detail && (
              <Row
                media={
                  <RowIcon className={status.tone}>
                    <AlertTriangleIcon />
                  </RowIcon>
                }
                title={status.text}
                description={status.detail}
              />
            )}
            <Row
              media={
                <RowIcon className="bg-muted-foreground/70">
                  <ClockIcon />
                </RowIcon>
              }
              title={props.lastSyncAt ? 'Last sync' : 'Not synced yet'}
              trailing={props.lastSyncAt && <span className="text-xs tabular-nums">{relativeTime(props.lastSyncAt)}</span>}
            />
            <Row
              media={
                <RowIcon className={pending === 0 ? 'bg-muted-foreground/70' : undefined}>
                  <UsersIcon />
                </RowIcon>
              }
              title={
                pending === 0
                  ? 'No conversations waiting for an Attio match.'
                  : `${pending} conversation${pending === 1 ? '' : 's'} waiting for an Attio match. Open LinkedIn to review.`
              }
              className="font-normal"
            />
            {props.lastError && (
              <Row
                media={
                  <RowIcon className="bg-destructive">
                    <AlertCircleIcon />
                  </RowIcon>
                }
                title={<span className="font-normal break-words text-destructive">{props.lastError}</span>}
              />
            )}
          </Group>

          <Group>
            <AccountRows me={props.me} />
          </Group>
        </div>
      </div>

      {/* actions stay pinned to the bottom of the panel */}
      <footer className="shrink-0 border-t border-border/60 px-4 pt-3 pb-2">
        <div className={cn(column, 'flex flex-col gap-1')}>
          <Button size="lg" className="h-10 w-full rounded-full text-sm" disabled={props.syncing} onClick={props.onSyncNow}>
            {props.syncing && <Spinner className="size-3.5" />}
            {props.syncing ? 'Syncing…' : 'Sync now'}
          </Button>
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" className="rounded-full text-xs text-link hover:text-link" onClick={props.onOpenGuide}>
              Setup guide
            </Button>
            <Button variant="ghost" size="sm" className="rounded-full text-xs text-muted-foreground" onClick={props.onSignOut}>
              Sign out
            </Button>
          </div>
        </div>
      </footer>
    </>
  )
}

/** Stays near the top of the panel until the review of recent conversations is submitted. */
function ReviewPrompt({ review }: { review: { status: ReviewStatus; onOpen: () => void } }) {
  return (
    <button
      type="button"
      onClick={review.onOpen}
      className="flex w-full items-center gap-3 rounded-xl bg-primary/10 px-3 py-2.5 text-left text-[13px] transition-colors outline-none hover:bg-primary/15 focus-visible:ring-3 focus-visible:ring-ring/30 dark:bg-primary/20 dark:hover:bg-primary/25"
    >
      <RowIcon>
        <ListChecksIcon />
      </RowIcon>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-medium text-link">Choose which conversations sync</span>
        <span className="text-xs leading-snug text-muted-foreground">
          {review.status === 'collecting'
            ? 'Reading your recent LinkedIn conversations…'
            : 'Pick the Attio person for each of your recent conversations.'}
        </span>
      </span>
      <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
    </button>
  )
}

function Notice({ text }: { text: string }) {
  return (
    <p
      role="alert"
      className="flex w-full items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2.5 text-left text-[13px] leading-snug text-destructive"
    >
      <AlertCircleIcon className="mt-px size-4 shrink-0" />
      {text}
    </p>
  )
}
