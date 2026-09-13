'use client'

import type { AttioPersonSummary, ReviewDecision, ReviewItem, ReviewResponse } from '@linkedin-sync/core'
import { AlertCircleIcon, CheckIcon, ExternalLinkIcon, PlusIcon, SearchIcon, XIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type * as React from 'react'

import { Button } from '@linkedin-sync/ui/components/button'
import { Input } from '@linkedin-sync/ui/components/input'
import { Skeleton } from '@linkedin-sync/ui/components/skeleton'
import { Spinner } from '@linkedin-sync/ui/components/spinner'
import { cn } from '@linkedin-sync/ui/lib/utils'
import { AppIcon, PersonAvatar } from '@linkedin-sync/ui/views/shared'

/** What the teammate picked for one conversation. */
export type ReviewChoice = { type: 'link'; person: AttioPersonSummary } | { type: 'create' } | { type: 'skip' }

export type ReviewViewState =
  | { kind: 'signedOut'; signingIn: boolean; error: string | null; onSignIn: () => void }
  /** The sync loop is still paging back through the inbox */
  | { kind: 'collecting'; collected: number; target: number }
  /** Waiting for the review, which includes the Attio lookups */
  | { kind: 'loading' }
  | {
      kind: 'ready'
      review: ReviewResponse
      submitting: boolean
      /** A failed submit; the button stays available to try again */
      error: string | null
      /** For previews: a row that starts open, with a search already typed */
      initialExpanded?: string
      initialQuery?: string
    }
  | { kind: 'done'; synced: number; failed: number; /** Opened after the review was already submitted */ alreadyDone: boolean }
  | { kind: 'error'; message: string; onRetry: () => void }

export interface ReviewViewProps {
  state: ReviewViewState
  onSearch: (query: string) => Promise<AttioPersonSummary[]>
  onSubmit: (decisions: ReviewDecision[]) => void
  onOpenLinkedIn: () => void
  onClose: () => void
  className?: string
}

const SEARCH_DEBOUNCE_MS = 250

const nameOf = (item: ReviewItem) => `${item.contact.firstName} ${item.contact.lastName}`.trim()
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function lastActive(timestamp: number): string {
  const days = Math.floor((Date.now() - timestamp) / 86_400_000)
  if (days < 1) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** A known match is preselected unless the conversation was dismissed before; everything else starts unsynced. */
function initialChoice(item: ReviewItem): ReviewChoice {
  return item.match && !item.ignored ? { type: 'link', person: item.match } : { type: 'skip' }
}

function toDecision(conversationUrn: string, choice: ReviewChoice): ReviewDecision {
  switch (choice.type) {
    case 'link':
      return { conversationUrn, action: { type: 'link', recordId: choice.person.recordId } }
    case 'create':
      return { conversationUrn, action: { type: 'create' } }
    default:
      return { conversationUrn, action: { type: 'skip' } }
  }
}

const usesMatch = (item: ReviewItem, choice: ReviewChoice | undefined) =>
  choice?.type === 'link' && choice.person.recordId === item.match?.recordId

/** The first-sign-in review: pick the Attio person for each recent LinkedIn conversation that should sync. */
export function ReviewView({ state, onSearch, onSubmit, onOpenLinkedIn, onClose, className }: ReviewViewProps) {
  return (
    <main className={cn('min-h-svh bg-background font-sans text-foreground antialiased', className)}>
      <div className="mx-auto flex w-full max-w-[680px] flex-col px-4 sm:px-6">
        <Body state={state} onSearch={onSearch} onSubmit={onSubmit} onOpenLinkedIn={onOpenLinkedIn} onClose={onClose} />
      </div>
    </main>
  )
}

function Body({ state, onSearch, onSubmit, onOpenLinkedIn, onClose }: Omit<ReviewViewProps, 'className'>) {
  switch (state.kind) {
    case 'signedOut':
      return (
        <Centered
          icon={<AppIcon className="size-14 shadow-md" />}
          title="Sign in to choose what syncs"
          actions={
            <Button size="lg" className="h-10 rounded-full px-5" disabled={state.signingIn} onClick={state.onSignIn}>
              {state.signingIn && <Spinner className="size-3.5" />}
              {state.signingIn ? 'Waiting for Attio…' : 'Sign in with Attio'}
            </Button>
          }
        >
          <Lead>Sign in with your Attio account first, then pick which LinkedIn conversations sync.</Lead>
          {state.error && <ErrorText text={state.error} />}
        </Centered>
      )

    case 'collecting':
      return <Collecting collected={state.collected} target={state.target} />

    case 'loading':
      return <Loading />

    case 'ready':
      return <Ready state={state} onSearch={onSearch} onSubmit={onSubmit} />

    case 'done': {
      const title = state.alreadyDone
        ? 'You’ve already chosen what syncs'
        : state.synced > 0
          ? `Syncing ${plural(state.synced, 'conversation')} to Attio`
          : 'All set'
      return (
        <Centered
          icon={
            <span className="flex size-14 items-center justify-center rounded-full bg-green-500 text-white shadow-md">
              <CheckIcon className="size-7" strokeWidth={3} />
            </span>
          }
          title={title}
          actions={
            <>
              <Button size="lg" className="h-10 rounded-full px-5" onClick={onOpenLinkedIn}>
                Open LinkedIn messaging
                <ExternalLinkIcon data-icon="inline-end" className="size-3.5" />
              </Button>
              <Button size="lg" variant="outline" className="h-10 rounded-full px-5" onClick={onClose}>
                Close
              </Button>
            </>
          }
        >
          <Lead>
            {state.alreadyDone
              ? 'New conversations ask you when you reply, and Sync to Attio on LinkedIn links any other.'
              : state.synced > 0
                ? 'Notes appear on each person over the next few minutes.'
                : 'Nothing syncs for now. You can sync any conversation later with Sync to Attio on LinkedIn.'}
          </Lead>
          {state.failed > 0 && (
            <ErrorText text={`${plural(state.failed, 'conversation')} couldn’t be linked in Attio and won’t sync.`} />
          )}
        </Centered>
      )
    }

    case 'error':
      return (
        <Centered
          icon={
            <span className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertCircleIcon className="size-7" />
            </span>
          }
          title="Couldn’t load your conversations"
          actions={
            <Button size="lg" className="h-10 rounded-full px-5" onClick={state.onRetry}>
              Try again
            </Button>
          }
        >
          <Lead>{state.message}</Lead>
        </Centered>
      )
  }
}

function Centered({
  icon,
  title,
  actions,
  children,
}: {
  icon: React.ReactNode
  title: string
  actions?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="flex min-h-[70svh] flex-col items-center justify-center gap-5 py-16 text-center">
      {icon}
      <div className="flex w-full max-w-md flex-col items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center justify-center gap-2 pt-1">{actions}</div>}
    </div>
  )
}

function Lead({ children }: { children: React.ReactNode }) {
  return <p className="text-[15px] leading-relaxed text-pretty text-muted-foreground">{children}</p>
}

function ErrorText({ text }: { text: string }) {
  return (
    <p role="alert" className="flex items-start gap-1.5 text-left text-sm leading-snug text-destructive">
      <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" />
      {text}
    </p>
  )
}

function Collecting({ collected, target }: { collected: number; target: number }) {
  const shown = Math.min(collected, target)
  const percent = target > 0 ? Math.round((shown / target) * 100) : 0
  let caption = `${shown} of ${target} conversations`
  if (collected === 0) caption = 'Connecting to your LinkedIn account…'
  else if (collected >= target) caption = 'Finding the people in Attio…'

  return (
    <Centered icon={<AppIcon className="size-14 shadow-md" />} title="Reading your recent LinkedIn conversations">
      <Lead>This takes a minute or two. Keep Chrome open and stay logged in to LinkedIn.</Lead>
      <div className="mt-4 flex w-full max-w-xs flex-col gap-2">
        <div
          role="progressbar"
          aria-label="Conversations read"
          aria-valuemin={0}
          aria-valuemax={target}
          aria-valuenow={shown}
          className="h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out" style={{ width: `${percent}%` }} />
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">{caption}</p>
      </div>
    </Centered>
  )
}

function Header({ children }: { children?: React.ReactNode }) {
  return (
    <header className="flex flex-col gap-3 pt-10 pb-6 sm:pt-14">
      <AppIcon className="size-11" />
      <h1 className="text-3xl font-semibold tracking-tight text-balance">Choose what syncs to Attio</h1>
      {children}
    </header>
  )
}

function Loading() {
  return (
    <>
      <Header>
        <p className="flex items-center gap-2 text-[15px] text-muted-foreground">
          <Spinner className="size-4" />
          Finding the people in Attio…
        </p>
      </Header>
      <div aria-hidden className="mb-10 flex flex-col overflow-hidden rounded-2xl bg-muted">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="size-9 rounded-full bg-foreground/10" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-36 rounded-md bg-foreground/10" />
              <Skeleton className="h-3 w-60 max-w-full rounded-md bg-foreground/[0.07]" />
            </div>
            <Skeleton className="hidden h-7 w-28 rounded-full bg-foreground/10 sm:block" />
          </div>
        ))}
      </div>
    </>
  )
}

function Ready({
  state,
  onSearch,
  onSubmit,
}: {
  state: Extract<ReviewViewState, { kind: 'ready' }>
  onSearch: ReviewViewProps['onSearch']
  onSubmit: ReviewViewProps['onSubmit']
}) {
  const { review, submitting, error } = state
  const [choices, setChoices] = useState<Record<string, ReviewChoice>>(() =>
    Object.fromEntries(review.items.map((item) => [item.conversationUrn, initialChoice(item)])),
  )
  const [expanded, setExpanded] = useState<string | null>(state.initialExpanded ?? null)

  const choiceFor = (item: ReviewItem): ReviewChoice => choices[item.conversationUrn] ?? { type: 'skip' }
  const choose = (item: ReviewItem, choice: ReviewChoice) => {
    setChoices((current) => ({ ...current, [item.conversationUrn]: choice }))
    setExpanded(null)
  }

  const syncing = review.items.filter((item) => choiceFor(item).type !== 'skip').length
  const skipped = review.items.length - syncing
  const unusedMatches = review.items.filter((item) => item.match && !usesMatch(item, choices[item.conversationUrn]))

  const useAllMatches = () =>
    setChoices((current) => {
      const next = { ...current }
      for (const item of unusedMatches) if (item.match) next[item.conversationUrn] = { type: 'link', person: item.match }
      return next
    })

  const submit = () => onSubmit(review.items.map((item) => toDecision(item.conversationUrn, choiceFor(item))))

  return (
    <>
      <Header>
        <p className="max-w-xl text-[15px] leading-relaxed text-pretty text-muted-foreground">
          {review.items.length > 0 ? (
            <>
              These are your {plural(review.items.length, 'most recent LinkedIn conversation')}. Pick the Attio person for each one
              you want synced; the rest won’t be. You can still sync any conversation later with{' '}
              <strong className="font-medium text-foreground">Sync to Attio</strong> on LinkedIn.
            </>
          ) : (
            'None of your recent LinkedIn conversations need a decision.'
          )}
        </p>
        {review.alreadyLinked > 0 && (
          <p className="text-sm text-muted-foreground">
            {review.alreadyLinked === 1
              ? '1 recent conversation already syncs.'
              : `${review.alreadyLinked} recent conversations already sync.`}
          </p>
        )}
      </Header>

      {review.items.length > 0 && (
        <ul className="flex flex-col overflow-hidden rounded-2xl bg-muted">
          {review.items.map((item) => (
            <ReviewRow
              key={item.conversationUrn}
              item={item}
              choice={choiceFor(item)}
              expanded={expanded === item.conversationUrn}
              disabled={submitting}
              onToggle={() => setExpanded((current) => (current === item.conversationUrn ? null : item.conversationUrn))}
              onChoose={(choice) => choose(item, choice)}
              onCollapse={() => setExpanded(null)}
              onSearch={onSearch}
              initialQuery={state.initialExpanded === item.conversationUrn ? state.initialQuery : undefined}
            />
          ))}
        </ul>
      )}

      {/* stays in view at the bottom of the page, over the list */}
      <div className="sticky bottom-0 -mx-4 mt-6 border-t border-border/60 bg-background/85 px-4 py-3 backdrop-blur-xl backdrop-saturate-150 sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="text-sm text-muted-foreground tabular-nums">
            <span className="font-medium text-foreground">{syncing}</span> will sync · {skipped} won’t
          </p>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {unusedMatches.length > 0 && (
              <Button variant="ghost" size="lg" className="h-10 rounded-full px-4" disabled={submitting} onClick={useAllMatches}>
                Use all matches
              </Button>
            )}
            <Button size="lg" className="h-10 rounded-full px-5" disabled={submitting} onClick={submit}>
              {submitting && <Spinner className="size-3.5" />}
              {syncing > 0 ? `Sync ${plural(syncing, 'conversation')}` : 'Continue without syncing'}
            </Button>
          </div>
          {error && (
            <div className="basis-full">
              <ErrorText text={error} />
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function ReviewRow({
  item,
  choice,
  expanded,
  disabled,
  onToggle,
  onChoose,
  onCollapse,
  onSearch,
  initialQuery,
}: {
  item: ReviewItem
  choice: ReviewChoice
  expanded: boolean
  disabled: boolean
  onToggle: () => void
  onChoose: (choice: ReviewChoice) => void
  onCollapse: () => void
  onSearch: ReviewViewProps['onSearch']
  initialQuery?: string
}) {
  const name = nameOf(item)
  const detail = [lastActive(item.lastActivityAt), item.contact.headline].filter(Boolean).join(' · ')

  return (
    <li
      className={cn(
        'relative not-last:after:absolute not-last:after:right-0 not-last:after:bottom-0 not-last:after:left-[64px] not-last:after:h-px not-last:after:bg-border/70',
        expanded && 'bg-foreground/[0.03]',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <PersonAvatar name={name} className="size-9" />
        <div className="flex min-w-0 flex-1 basis-40 flex-col">
          <p className="truncate text-sm leading-snug font-medium">{name}</p>
          <p className="truncate text-xs leading-snug text-muted-foreground">{detail}</p>
        </div>
        {/* wraps under the name on narrow screens, indented past the avatar */}
        <div className="ml-auto flex min-w-0 items-center gap-1.5 pl-12 sm:pl-0">
          <Decision
            item={item}
            name={name}
            choice={choice}
            expanded={expanded}
            disabled={disabled}
            onToggle={onToggle}
            onClear={() => onChoose({ type: 'skip' })}
          />
        </div>
      </div>
      {expanded && (
        <Chooser
          item={item}
          name={name}
          choice={choice}
          disabled={disabled}
          onChoose={onChoose}
          onCollapse={onCollapse}
          onSearch={onSearch}
          initialQuery={initialQuery}
        />
      )}
    </li>
  )
}

function Decision({
  item,
  name,
  choice,
  expanded,
  disabled,
  onToggle,
  onClear,
}: {
  item: ReviewItem
  name: string
  choice: ReviewChoice
  expanded: boolean
  disabled: boolean
  onToggle: () => void
  onClear: () => void
}) {
  if (choice.type === 'skip') {
    return (
      <>
        <span className="text-xs text-muted-foreground">Won’t sync</span>
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled}
          aria-expanded={expanded}
          onClick={onToggle}
          className="rounded-full bg-background text-xs ring-1 ring-border/60 hover:bg-background/70 dark:bg-foreground/10 dark:ring-0"
        >
          Choose person
        </Button>
      </>
    )
  }

  const matched = usesMatch(item, choice)
  return (
    <>
      {matched && <span className="hidden text-[11px] text-muted-foreground sm:inline">Matched</span>}
      <button
        type="button"
        disabled={disabled}
        aria-expanded={expanded}
        aria-label={choice.type === 'link' ? `Syncs to ${choice.person.name}. Change` : 'Creates a new Attio person. Change'}
        onClick={onToggle}
        className="inline-flex h-7 max-w-52 min-w-0 items-center gap-1.5 rounded-full bg-primary/10 pr-3 pl-2.5 text-xs font-medium text-link transition-colors outline-none hover:bg-primary/15 focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-50 dark:bg-primary/20 dark:hover:bg-primary/25"
      >
        {choice.type === 'link' ? (
          <CheckIcon className="size-3.5 shrink-0" strokeWidth={2.5} />
        ) : (
          <PlusIcon className="size-3.5 shrink-0" strokeWidth={2.5} />
        )}
        <span className="truncate">{choice.type === 'link' ? choice.person.name : 'Create in Attio'}</span>
      </button>
      <Button
        size="icon-xs"
        variant="ghost"
        disabled={disabled}
        aria-label={`Don’t sync ${name}`}
        onClick={onClear}
        className="rounded-full text-muted-foreground"
      >
        <XIcon />
      </Button>
    </>
  )
}

function Chooser({
  item,
  name,
  choice,
  disabled,
  onChoose,
  onCollapse,
  onSearch,
  initialQuery,
}: {
  item: ReviewItem
  name: string
  choice: ReviewChoice
  disabled: boolean
  onChoose: (choice: ReviewChoice) => void
  onCollapse: () => void
  onSearch: ReviewViewProps['onSearch']
  initialQuery?: string
}) {
  const [query, setQuery] = useState(initialQuery ?? '')
  const [results, setResults] = useState<AttioPersonSummary[] | null>(null)
  const [searching, setSearching] = useState(Boolean(initialQuery?.trim()))
  const seq = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const runSearch = (q: string) => {
    // only the latest search may show; typing fast can reorder responses
    const current = ++seq.current
    onSearch(q).then(
      (people) => {
        if (seq.current !== current) return
        setResults(people)
        setSearching(false)
      },
      () => {
        if (seq.current !== current) return
        setResults([])
        setSearching(false)
      },
    )
  }

  const search = (value: string) => {
    setQuery(value)
    clearTimeout(timer.current)
    const q = value.trim()
    if (!q) {
      seq.current++
      setResults(null)
      setSearching(false)
      return
    }
    setSearching(true)
    timer.current = setTimeout(() => runSearch(q), SEARCH_DEBOUNCE_MS)
  }

  useEffect(() => {
    const q = initialQuery?.trim()
    if (q) runSearch(q)
    return () => clearTimeout(timer.current)
    // only the query a row opens with; later typing goes through search()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedId = choice.type === 'link' ? choice.person.recordId : null
  const suggested = [item.match, ...item.suggestions].filter(
    (person, index, all): person is AttioPersonSummary =>
      person !== null && all.findIndex((other) => other?.recordId === person.recordId) === index,
  )

  return (
    <div className="flex flex-col gap-3 px-4 pb-4 sm:pl-16">
      {suggested.length > 0 && <People people={suggested} selectedId={selectedId} disabled={disabled} onPick={(person) => onChoose({ type: 'link', person })} />}

      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label={`Search Attio people for ${name}`}
          placeholder="Search Attio people…"
          value={query}
          disabled={disabled}
          onChange={(event) => search(event.currentTarget.value)}
          className="h-9 rounded-full border-transparent bg-background pl-8 text-[13px] ring-1 ring-border/60 md:text-[13px] dark:bg-foreground/10 dark:ring-0"
        />
      </div>

      {searching && (
        <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <Spinner className="size-3.5" />
          Searching…
        </p>
      )}
      {!searching &&
        results &&
        (results.length > 0 ? (
          <People people={results} selectedId={selectedId} disabled={disabled} onPick={(person) => onChoose({ type: 'link', person })} />
        ) : (
          <p className="px-1 text-xs text-muted-foreground">No Attio people match “{query.trim()}”</p>
        ))}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || choice.type === 'create'}
          onClick={() => onChoose({ type: 'create' })}
          className="max-w-full min-w-0 rounded-full bg-background dark:bg-transparent"
        >
          <PlusIcon strokeWidth={2.5} />
          <span className="truncate">Create “{name}” in Attio</span>
        </Button>
        {choice.type !== 'skip' && (
          <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onChoose({ type: 'skip' })} className="rounded-full text-muted-foreground">
            Don’t sync
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onCollapse} className="ml-auto rounded-full">
          Done
        </Button>
      </div>
    </div>
  )
}

function People({
  people,
  selectedId,
  disabled,
  onPick,
}: {
  people: AttioPersonSummary[]
  selectedId: string | null
  disabled: boolean
  onPick: (person: AttioPersonSummary) => void
}) {
  return (
    <ul className="flex flex-col overflow-hidden rounded-xl bg-background ring-1 ring-border/60 dark:bg-foreground/[0.05] dark:ring-0">
      {people.map((person) => {
        const selected = person.recordId === selectedId
        return (
          <li
            key={person.recordId}
            className="relative flex items-center gap-2.5 px-3 py-2 not-last:after:absolute not-last:after:right-0 not-last:after:bottom-0 not-last:after:left-[46px] not-last:after:h-px not-last:after:bg-border/70"
          >
            <PersonAvatar name={person.name} />
            <div className="flex min-w-0 flex-1 flex-col">
              <p className="truncate text-[13px] leading-snug font-medium">{person.name}</p>
              {person.emails[0] && <p className="truncate text-xs leading-snug text-muted-foreground">{person.emails[0]}</p>}
            </div>
            <Button
              size="xs"
              variant="secondary"
              disabled={disabled || selected}
              onClick={() => onPick(person)}
              className="rounded-full bg-primary/10 px-2.5 text-link hover:bg-primary/15 disabled:opacity-100 dark:bg-primary/20 dark:hover:bg-primary/25"
            >
              {selected ? (
                <>
                  <CheckIcon strokeWidth={2.5} />
                  Selected
                </>
              ) : (
                'This is them'
              )}
            </Button>
          </li>
        )
      })}
    </ul>
  )
}
