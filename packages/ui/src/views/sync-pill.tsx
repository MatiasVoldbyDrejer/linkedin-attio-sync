'use client'

import { CheckIcon, LogInIcon, MousePointerClickIcon, RefreshCwIcon } from 'lucide-react'

import { Button } from '@linkedin-sync/ui/components/button'
import { Spinner } from '@linkedin-sync/ui/components/spinner'
import { cn } from '@linkedin-sync/ui/lib/utils'

export type SyncPillState =
  | { kind: 'idle' }
  | { kind: 'busy'; label: string }
  /** needs_link: waiting for this thread's card to show up */
  | { kind: 'awaitingCard' }
  /** this thread's card is on screen */
  | { kind: 'picking' }
  | { kind: 'done'; label: string }
  | { kind: 'note'; text: string; tone: 'muted' | 'error' }

export type SyncPillVariant = 'inline' | 'floating'

export interface SyncPillProps {
  state: SyncPillState
  signedIn: boolean
  /** Not on a thread page */
  hidden?: boolean
  /** `inline` sits in LinkedIn's thread header; `floating` is the bottom-right fallback under the card */
  variant?: SyncPillVariant
  onClick: () => void
  className?: string
}

/** Frosted-glass surface shared by the LinkedIn card and pill. */
export const glass =
  'border border-border/60 bg-popover/85 text-popover-foreground shadow-xl shadow-black/10 backdrop-blur-xl backdrop-saturate-150 dark:shadow-black/40'

function label(state: SyncPillState, signedIn: boolean, variant: SyncPillVariant): string {
  // the header has less room than the corner
  const inline = variant === 'inline'
  switch (state.kind) {
    case 'busy':
    case 'done':
      return state.label
    case 'awaitingCard':
      return inline ? 'Loading…' : 'Loading Attio suggestions…'
    case 'picking':
      return inline ? 'Choose in the card' : 'Pick the Attio person above'
    default:
      if (signedIn) return 'Sync to Attio'
      return inline ? 'Sign in to sync' : 'Sign in to sync to Attio'
  }
}

function StateIcon({ state, signedIn }: { state: SyncPillState; signedIn: boolean }) {
  switch (state.kind) {
    case 'busy':
    case 'awaitingCard':
      return <Spinner className="size-3.5" />
    case 'picking':
      return <MousePointerClickIcon className="size-3.5" />
    case 'done':
      return <CheckIcon className="size-3.5" strokeWidth={2.5} />
    default:
      return signedIn ? <RefreshCwIcon className="size-3.5" /> : <LogInIcon className="size-3.5" />
  }
}

/** "Sync to Attio" capsule on LinkedIn thread pages, with its last outcome as a note. */
export function SyncPill({ state, signedIn, hidden, variant = 'floating', onClick, className }: SyncPillProps) {
  if (hidden) return null
  const inline = variant === 'inline'
  const pending = state.kind === 'busy' || state.kind === 'awaitingCard' || state.kind === 'picking'

  const note = state.kind === 'note' && (
    <p
      role="status"
      className={cn(
        glass,
        'rounded-xl px-3 py-1.5 text-xs leading-snug shadow-lg animate-in fade-in-0 duration-200',
        // inline, the note hangs below the header instead of pushing it taller
        inline ? 'absolute top-full right-0 z-10 mt-2 w-max max-w-[280px] slide-in-from-top-1' : 'slide-in-from-bottom-1',
        state.tone === 'error' ? 'text-destructive' : 'text-muted-foreground',
      )}
    >
      {state.text}
    </p>
  )

  return (
    <div className={cn(inline ? 'relative flex' : 'flex max-w-[360px] flex-col items-end gap-1.5', className)}>
      {!inline && note}
      <Button
        variant={inline ? 'secondary' : 'outline'}
        onClick={onClick}
        disabled={state.kind !== 'idle' && state.kind !== 'note'}
        className={cn(
          inline
            ? // a quiet tinted capsule among LinkedIn's header icons
              'h-8 gap-1.5 rounded-full border-transparent bg-primary/10 px-3 text-[13px] font-medium text-link shadow-none hover:bg-primary/15 hover:text-link disabled:opacity-100 dark:bg-primary/20 dark:hover:bg-primary/25'
            : cn(
                glass,
                'h-9 gap-2 rounded-full px-4 text-[13px] text-link shadow-lg hover:bg-popover hover:text-link disabled:opacity-100 dark:bg-popover/85 dark:hover:bg-popover',
              ),
          pending &&
            (inline ? 'bg-foreground/[0.05] text-muted-foreground dark:bg-foreground/10' : 'text-muted-foreground'),
          state.kind === 'done' &&
            (inline
              ? 'bg-green-600/10 text-green-700 dark:bg-green-400/15 dark:text-green-400'
              : 'text-green-600 dark:text-green-400'),
        )}
      >
        <StateIcon state={state} signedIn={signedIn} />
        {label(state, signedIn, variant)}
      </Button>
      {inline && note}
    </div>
  )
}
