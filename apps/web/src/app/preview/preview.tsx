'use client'

import type { AttioPersonSummary, MeResponse, PendingLink, ReviewItem, ReviewResponse } from '@linkedin-sync/core'
import { LinkCard, type LinkCardProps, LinkCardNotice } from '@linkedin-sync/ui/views/link-card'
import { ReviewView, type ReviewViewState } from '@linkedin-sync/ui/views/review-view'
import { SidePanelView, type SidePanelViewProps } from '@linkedin-sync/ui/views/side-panel-view'
import { SyncPill, type SyncPillState } from '@linkedin-sync/ui/views/sync-pill'
import { type WelcomeAccount, WelcomeView } from '@linkedin-sync/ui/views/welcome-view'
import { useState, useSyncExternalStore } from 'react'
import type * as React from 'react'

const noop = () => {}

const me: MeResponse = {
  user: { name: 'Sam Rivera', email: 'sam@example.com' },
  workspaceName: 'Example Workspace',
  linkedIn: { name: 'Sam Rivera', profileUrl: null },
  reviewStatus: 'done',
  extension: { latestVersion: '0.3.0', downloadUrl: '#' },
}

const update = { version: '0.3.0', downloadUrl: '#' }

const people: AttioPersonSummary[] = [
  { recordId: 'p1', name: 'Ada Lovelace', image: null, emails: ['ada@example.com'] },
  { recordId: 'p2', name: 'Ada King', image: null, emails: ['ada.king@example.org'] },
]

const searchResults: AttioPersonSummary[] = [
  { recordId: 'p3', name: 'Ada Lovelace-Byron', image: null, emails: ['countess@example.net'] },
]

const link: PendingLink = {
  conversationUrn: 'urn:li:msg_conversation:(urn:li:fsd_profile:sample,2-sample)',
  threadUrl: null,
  contact: {
    urn: 'urn:li:fsd_profile:sample',
    firstName: 'Ada',
    lastName: 'Lovelace',
    headline: 'Analyst of engines, poet of numbers and author of the first published algorithm',
    profileUrl: null,
  },
  lastActivityAt: 0,
  suggestions: people,
}

const minutesAgo = (minutes: number) => Date.now() - minutes * 60_000

const signedIn = {
  status: 'signedIn',
  me,
  update: null,
  health: { status: 'ok' },
  lastSyncAt: minutesAgo(3),
  lastError: null,
  pendingCount: 0,
  syncing: false,
  onSyncNow: noop,
  onSignOut: noop,
  onOpenGuide: noop,
} satisfies SidePanelViewProps

const panels: [string, SidePanelViewProps][] = [
  ['Loading', { status: 'loading' }],
  ['Signed out', { status: 'signedOut', signingIn: false, signInError: null, onSignIn: noop }],
  [
    'Signed out · session ended · sign-in error',
    {
      status: 'signedOut',
      notice: 'Your session ended. Sign in again to keep syncing.',
      signingIn: false,
      signInError: 'Signed in to a different Attio workspace.',
      onSignIn: noop,
    },
  ],
  ['Signing in', { status: 'signedOut', signingIn: true, signInError: null, onSignIn: noop }],
  ['Signed in · syncing', signedIn],
  ['Signed in · review still collecting', { ...signedIn, review: { status: 'collecting', onOpen: noop } }],
  ['Signed in · review ready', { ...signedIn, review: { status: 'ready', onOpen: noop } }],
  ['Signed in · 2 waiting · update · sync in progress', { ...signedIn, pendingCount: 2, update, syncing: true }],
  [
    'Signed in · repairing',
    {
      ...signedIn,
      health: { status: 'degraded', incidentId: 'i1', message: 'A LinkedIn response changed shape; a fix is on its way.' },
      pendingCount: 1,
    },
  ],
  [
    'Signed in · LinkedIn login needed · last error',
    {
      ...signedIn,
      me: { ...me, linkedIn: null },
      health: { status: 'auth_required', message: 'LinkedIn asked you to log in again.' },
      lastError: 'Backend 500 on /api/sync',
      lastSyncAt: minutesAgo(180),
    },
  ],
  ['Signed in · first sync pending · no profile yet', { ...signedIn, me: undefined, health: null, lastSyncAt: null }],
]

const welcomeBackend = { url: 'http://localhost:3000', onUrlChange: noop, onSubmit: noop, onReset: noop, result: null }

const welcomes: [string, WelcomeAccount | undefined, (typeof welcomeBackend)['result'] | { text: string; tone: 'muted' | 'error' }][] = [
  ['Signed out', { signedIn: false, signingIn: false, signInError: null, onSignIn: noop }, null],
  [
    'Signed out · session ended · waiting for Attio',
    { signedIn: false, notice: 'Your session ended. Sign in again to keep syncing.', signingIn: true, signInError: null, onSignIn: noop },
    null,
  ],
  [
    'Signed in · review not done yet',
    { signedIn: true, me: { ...me, reviewStatus: 'ready' }, update: null, onSignOut: noop, onOpenReview: noop },
    null,
  ],
  [
    'Signed in · update · backend error (open Advanced)',
    { signedIn: true, me, update, onSignOut: noop },
    { text: 'Permission to reach that backend was denied.', tone: 'error' },
  ],
]

const pills: [string, SyncPillState, boolean][] = [
  ['Idle', { kind: 'idle' }, true],
  ['Signed out', { kind: 'idle' }, false],
  ['Syncing', { kind: 'busy', label: 'Syncing…' }, true],
  ['Waiting for the card', { kind: 'awaitingCard' }, true],
  ['Picking', { kind: 'picking' }, true],
  ['Done', { kind: 'done', label: 'Synced to Attio' }, true],
  ['Muted note', { kind: 'note', tone: 'muted', text: 'LinkedIn didn’t answer. Try again.' }, true],
  ['Error note', { kind: 'note', tone: 'error', text: 'Couldn’t load the Attio prompt. Try again.' }, true],
]

const daysAgo = (days: number) => Date.now() - days * 86_400_000

const person = (recordId: string, name: string, email: string): AttioPersonSummary => ({
  recordId,
  name,
  image: null,
  emails: [email],
})

const reviewItem = (
  id: string,
  firstName: string,
  lastName: string,
  headline: string | null,
  days: number,
  extra: Partial<ReviewItem> = {},
): ReviewItem => ({
  conversationUrn: `urn:li:msg_conversation:(urn:li:fsd_profile:sample,2-${id})`,
  threadUrl: null,
  contact: { urn: `urn:li:fsd_profile:${id}`, firstName, lastName, headline, profileUrl: null },
  lastActivityAt: daysAgo(days),
  match: null,
  suggestions: [],
  ignored: false,
  ...extra,
})

const reviewItems: ReviewItem[] = [
  reviewItem('ada', 'Ada', 'Lovelace', 'Analyst of engines, poet of numbers and author of the first published algorithm', 0.1, {
    match: person('r1', 'Ada Lovelace', 'ada@example.com'),
  }),
  reviewItem('grace', 'Grace', 'Hopper', 'Rear admiral and compiler pioneer', 1.2, {
    suggestions: [person('r2', 'Grace Hopper', 'grace@example.com'), person('r3', 'Grace Brewster', 'g.brewster@example.org')],
  }),
  reviewItem('alan', 'Alan', 'Turing', 'Mathematician and codebreaker', 4),
  reviewItem('katherine', 'Katherine', 'Johnson', 'Mathematician at NASA', 9, {
    match: person('r4', 'Katherine Johnson', 'katherine@example.com'),
    suggestions: [person('r5', 'Katherine G. Johnson', 'kgj@example.net')],
  }),
  reviewItem('charles', 'Charles', 'Babbage', null, 21, {
    suggestions: [person('r6', 'Charles Babbage', 'charles@example.com')],
    ignored: true,
  }),
  reviewItem('hedy', 'Hedy', 'Lamarr', 'Inventor of frequency hopping', 38, {
    match: person('r7', 'Hedy Lamarr', 'hedy@example.com'),
    ignored: true,
  }),
]

const review: ReviewResponse = { status: 'ready', collected: 100, target: 100, items: reviewItems, alreadyLinked: 3 }

const attioPeople: AttioPersonSummary[] = [
  person('r8', 'Alan Turing', 'alan@example.com'),
  person('r9', 'Alan M. Turing', 'turing@example.org'),
  person('r2', 'Grace Hopper', 'grace@example.com'),
  person('r6', 'Charles Babbage', 'charles@example.com'),
]

const searchAttio = async (query: string) => attioPeople.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))

const reviews: [string, ReviewViewState][] = [
  ['Signed out', { kind: 'signedOut', signingIn: false, error: null, onSignIn: noop }],
  ['Collecting · connecting', { kind: 'collecting', collected: 0, target: 100 }],
  ['Collecting · 48 of 100', { kind: 'collecting', collected: 48, target: 100 }],
  ['Loading matches', { kind: 'loading' }],
  ['Ready · a match, suggestions, nothing, dismissed', { kind: 'ready', review, submitting: false, error: null }],
  [
    'Ready · a row open with search results',
    { kind: 'ready', review, submitting: false, error: null, initialExpanded: reviewItems[2]!.conversationUrn, initialQuery: 'Turing' },
  ],
  ['Submitting', { kind: 'ready', review, submitting: true, error: null }],
  ['Submit failed', { kind: 'ready', review, submitting: false, error: 'Backend error (500)' }],
  ['Done', { kind: 'done', synced: 12, failed: 0, alreadyDone: false }],
  ['Done · 2 failed', { kind: 'done', synced: 10, failed: 2, alreadyDone: false }],
  ['Opened again after submitting', { kind: 'done', synced: 0, failed: 0, alreadyDone: true }],
  ['Error', { kind: 'error', message: 'Backend unreachable', onRetry: noop }],
]

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="flex flex-col gap-6 border-t border-border py-12 first:border-t-0">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      <div className="flex flex-wrap items-start gap-8">{children}</div>
    </section>
  )
}

function Frame({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <figure className={className}>
      <figcaption className="mb-2 font-mono text-xs text-muted-foreground">{label}</figcaption>
      <div className="w-fit overflow-hidden rounded-xl ring-1 ring-border">{children}</div>
    </figure>
  )
}

/** LinkedIn-ish backdrop so the frosted card and pill read like they do on the page. */
function Backdrop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <figure>
      <figcaption className="mb-2 font-mono text-xs text-muted-foreground">{label}</figcaption>
      <div className="flex w-fit flex-col items-end gap-2 rounded-xl bg-[repeating-linear-gradient(135deg,var(--color-muted)_0_12px,var(--color-background)_12px_24px)] p-4 text-[13px] ring-1 ring-border">
        {children}
      </div>
    </figure>
  )
}

/** Stand-in for LinkedIn's thread header row: name on the left, then the pill, ⋯ and ☆. Room below for the note. */
function ThreadHeader({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <figure className="w-[420px] max-w-full pb-12">
      <figcaption className="mb-2 font-mono text-xs text-muted-foreground">{label}</figcaption>
      <div className="flex h-11 items-center justify-between rounded-xl bg-card px-3 ring-1 ring-border">
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold">Ada Lovelace</span>
          <span className="truncate text-xs text-muted-foreground">Mobile · 7h ago</span>
        </div>
        <div className="ml-auto flex flex-none items-center">
          {children}
          <span className="flex size-10 items-center justify-center text-muted-foreground">⋯</span>
          <span className="flex size-10 items-center justify-center text-muted-foreground">☆</span>
        </div>
      </div>
    </figure>
  )
}

function InteractiveCard(props: Omit<LinkCardProps, 'query' | 'onQueryChange' | 'onLink' | 'onCreate' | 'onSnooze' | 'onIgnore'>) {
  const [query, setQuery] = useState('')
  return (
    <LinkCard
      {...props}
      query={query}
      onQueryChange={setQuery}
      onLink={noop}
      onCreate={noop}
      onSnooze={noop}
      onIgnore={noop}
    />
  )
}

const subscribeNever = () => noop

export function Preview() {
  // relative times like "3 min ago" read the clock, so render only in the browser to avoid a hydration mismatch
  const inBrowser = useSyncExternalStore(subscribeNever, () => true, () => false)
  if (!inBrowser) return null

  return (
    <main className="mx-auto max-w-[1400px] px-8 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Extension UI</h1>
        <p className="text-muted-foreground">Every extension view in every state, at real size. Light and dark follow the OS.</p>
      </header>

      <Section id="side-panel" title="Side panel">
        {panels.map(([label, props]) => (
          <Frame key={label} label={label}>
            {/* about the width Chrome opens the side panel at; the view fills the height it's given */}
            <div className="h-[600px] w-[360px]">
              <SidePanelView {...props} className="h-full" />
            </div>
          </Frame>
        ))}
      </Section>

      <Section id="card" title="LinkedIn card">
        <Backdrop label="Suggestions · 3 waiting">
          <InteractiveCard link={link} total={3} results={null} error={null} busy={false} />
        </Backdrop>
        <Backdrop label="Search results">
          <LinkCard
            link={{ ...link, suggestions: [] }}
            total={1}
            query="Ada"
            results={searchResults}
            error={null}
            busy={false}
            onQueryChange={noop}
            onLink={noop}
            onCreate={noop}
            onSnooze={noop}
            onIgnore={noop}
          />
        </Backdrop>
        <Backdrop label="No match · busy">
          <LinkCard
            link={{ ...link, contact: { ...link.contact, headline: null }, suggestions: [] }}
            total={1}
            query="Lovelace"
            results={[]}
            error="No Attio people match “Lovelace”"
            busy
            onQueryChange={noop}
            onLink={noop}
            onCreate={noop}
            onSnooze={noop}
            onIgnore={noop}
          />
        </Backdrop>
        <Backdrop label="Notice after a choice, over the pill">
          <LinkCardNotice text="Synced to Ada Lovelace in Attio" />
          <SyncPill state={{ kind: 'picking' }} signedIn onClick={noop} />
        </Backdrop>
      </Section>

      <Section id="pill" title="Sync pill">
        {pills.map(([label, state, isSignedIn]) => (
          <Backdrop key={label} label={label}>
            <SyncPill state={state} signedIn={isSignedIn} onClick={noop} />
          </Backdrop>
        ))}
      </Section>

      <Section id="header-pill" title="Sync pill in LinkedIn's thread header">
        {pills.map(([label, state, isSignedIn]) => (
          <ThreadHeader key={label} label={label}>
            <SyncPill variant="inline" state={state} signedIn={isSignedIn} onClick={noop} />
          </ThreadHeader>
        ))}
      </Section>

      <Section id="review" title="Review of recent conversations">
        {reviews.map(([label, state]) => (
          <Frame key={label} label={label}>
            {/* the page scrolls inside the frame, so the sticky action bar behaves as in a tab */}
            <div className="h-[760px] w-[720px] max-w-full overflow-auto">
              <ReviewView
                state={state}
                onSearch={searchAttio}
                onSubmit={noop}
                onOpenLinkedIn={noop}
                onClose={noop}
                className="min-h-full"
              />
            </div>
          </Frame>
        ))}
      </Section>

      <Section id="welcome" title="Welcome page">
        {welcomes.map(([label, account, result]) => (
          <Frame key={label} label={label} className="w-full">
            <div className="h-[1000px] w-[900px] max-w-full overflow-auto">
              <WelcomeView
                account={account}
                onOpenLinkedIn={noop}
                backend={{ ...welcomeBackend, result }}
                className="min-h-full"
              />
            </div>
          </Frame>
        ))}
      </Section>
    </main>
  )
}
