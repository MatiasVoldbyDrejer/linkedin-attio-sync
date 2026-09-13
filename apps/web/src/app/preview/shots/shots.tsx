'use client'

import type { AttioPersonSummary, LiParticipant, MeResponse, PendingLink, ReviewItem, ReviewResponse } from '@linkedin-sync/core'
import { cn } from '@linkedin-sync/ui/lib/utils'
import { LinkCard } from '@linkedin-sync/ui/views/link-card'
import { ReviewView } from '@linkedin-sync/ui/views/review-view'
import { AppIcon } from '@linkedin-sync/ui/views/shared'
import { SidePanelView } from '@linkedin-sync/ui/views/side-panel-view'
import { SyncPill, type SyncPillState } from '@linkedin-sync/ui/views/sync-pill'
import { useLayoutEffect, useSyncExternalStore } from 'react'
import type * as React from 'react'
import type { ShotName } from './shot-names'

/** Where the social card points people; forks can change it to their own repository. */
const REPOSITORY = 'github.com/MatiasVoldbyDrejer/linkedin-attio-sync'

const noop = () => {}
const noResults = async () => []
const subscribeNever = () => noop

// ---- sample data: made-up workspace, historical names, example.com addresses ----

const person = (recordId: string, name: string, email: string): AttioPersonSummary => ({
  recordId,
  name,
  image: null,
  emails: [email],
})

const contact = (id: string, firstName: string, lastName: string, headline: string): LiParticipant => ({
  urn: `urn:li:fsd_profile:${id}`,
  firstName,
  lastName,
  headline,
  profileUrl: null,
})

const grace = contact('grace', 'Grace', 'Hopper', 'Rear admiral and compiler pioneer')

const pendingLink: PendingLink = {
  conversationUrn: 'urn:li:msg_conversation:(urn:li:fsd_profile:sam,2-grace)',
  threadUrl: null,
  contact: grace,
  lastActivityAt: 0,
  suggestions: [person('r2', 'Grace Hopper', 'grace@example.com'), person('r3', 'Grace Brewster', 'g.brewster@example.org')],
}

const me: MeResponse = {
  user: { name: 'Sam Rivera', email: 'sam@example.com' },
  workspaceName: 'Example Workspace',
  linkedIn: { name: 'Sam Rivera', profileUrl: null },
  reviewStatus: 'done',
  extension: { latestVersion: '0.5.0', downloadUrl: '#' },
}

const reviewItem = (c: LiParticipant, days: number, extra: Partial<ReviewItem> = {}): ReviewItem => ({
  conversationUrn: `urn:li:msg_conversation:(urn:li:fsd_profile:sam,2-${c.urn.split(':').pop()})`,
  threadUrl: null,
  contact: c,
  lastActivityAt: Date.now() - days * 86_400_000,
  match: null,
  suggestions: [],
  ignored: false,
  ...extra,
})

const review: ReviewResponse = {
  status: 'ready',
  collected: 100,
  target: 100,
  alreadyLinked: 12,
  items: [
    reviewItem(contact('ada', 'Ada', 'Lovelace', 'Analyst of engines and author of the first algorithm'), 0.2, {
      match: person('r1', 'Ada Lovelace', 'ada@example.com'),
    }),
    reviewItem(grace, 1.1, { suggestions: pendingLink.suggestions }),
    reviewItem(contact('katherine', 'Katherine', 'Johnson', 'Mathematician at NASA'), 3, {
      match: person('r4', 'Katherine Johnson', 'katherine@example.com'),
    }),
    reviewItem(contact('alan', 'Alan', 'Turing', 'Mathematician and codebreaker'), 5),
    reviewItem(contact('margaret', 'Margaret', 'Hamilton', 'Director of software engineering, Apollo'), 9, {
      match: person('r5', 'Margaret Hamilton', 'margaret@example.com'),
    }),
    reviewItem(contact('hedy', 'Hedy', 'Lamarr', 'Inventor of frequency hopping'), 16),
    reviewItem(contact('dorothy', 'Dorothy', 'Vaughan', 'Head of the West Area Computers'), 24, {
      suggestions: [person('r6', 'Dorothy Vaughan', 'dorothy@example.com')],
    }),
  ],
}

const THREADS = [
  { name: 'Grace Hopper', snippet: 'Thursday works. I’ll bring my notes.', when: 'Today' },
  { name: 'Ada Lovelace', snippet: 'You: Sending the deck over now', when: 'Yesterday' },
  { name: 'Katherine Johnson', snippet: 'Thanks for the intro!', when: 'Wed' },
  { name: 'Alan Turing', snippet: 'You: Happy to walk you through it', when: 'Mon' },
  { name: 'Margaret Hamilton', snippet: 'Let’s pick this up next week', when: 'Sep 4' },
  { name: 'Hedy Lamarr', snippet: 'Great meeting you at the summit', when: 'Aug 28' },
  { name: 'Dorothy Vaughan', snippet: 'You: Talk soon', when: 'Aug 20' },
]

const MESSAGES = [
  { name: 'Grace Hopper', time: '10:02', text: 'Loved your talk on compilers last week. Would your team be up for a small pilot this quarter?' },
  { name: 'Sam Rivera', time: '10:15', text: 'Absolutely. Does Thursday at 2pm work for a quick call?' },
  { name: 'Grace Hopper', time: '10:21', text: 'Thursday works. I’ll bring my notes.' },
]

// ---- building blocks ----

const AVATAR_TONES = ['bg-sky-500', 'bg-violet-500', 'bg-amber-500', 'bg-emerald-500', 'bg-rose-500', 'bg-indigo-500', 'bg-teal-500']

function Initials({ name, className }: { name: string; className?: string }) {
  const tone = AVATAR_TONES[[...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % AVATAR_TONES.length]
  const letters = name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
  return (
    <span className={cn('flex shrink-0 items-center justify-center rounded-full font-semibold text-white', tone, className)}>
      {letters}
    </span>
  )
}

/** Soft tinted backdrop the product sits on. */
function Stage({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn('relative flex h-screen w-screen items-center justify-center overflow-hidden font-sans text-foreground antialiased', className)}
      style={{
        backgroundColor: '#f3f5fa',
        backgroundImage:
          'radial-gradient(55% 65% at 12% 8%, rgba(0,113,227,0.18), transparent 70%), radial-gradient(45% 55% at 92% 96%, rgba(124,92,255,0.14), transparent 70%)',
      }}
    >
      {/* the Next.js dev indicator isn't part of the picture */}
      <style>{'nextjs-portal{display:none!important}'}</style>
      {children}
    </div>
  )
}

function Window({ title, className, children }: { title?: string; className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-2xl bg-background shadow-[0_40px_90px_-24px_rgba(15,30,60,0.38)] ring-1 ring-black/10',
        className,
      )}
    >
      <div className="relative flex h-10 shrink-0 items-center gap-2 border-b border-border/70 bg-muted/70 px-4">
        <span className="size-3 rounded-full bg-[#ff5f57]" />
        <span className="size-3 rounded-full bg-[#febc2e]" />
        <span className="size-3 rounded-full bg-[#28c840]" />
        {title && (
          <span className="absolute inset-x-0 text-center text-[13px] font-medium text-muted-foreground">{title}</span>
        )}
      </div>
      <div className="relative min-h-0 flex-1">{children}</div>
    </div>
  )
}

/** A generic messaging page: thread list, then the open thread with the Sync pill in its header. */
function Messaging({ pill, showCard, compactList }: { pill: SyncPillState; showCard?: boolean; compactList?: boolean }) {
  return (
    <div className="flex h-full bg-background">
      <aside className={cn('flex shrink-0 flex-col border-r border-border/70', compactList ? 'w-[280px]' : 'w-[320px]')}>
        <div className="px-4 pt-4 pb-3">
          <div className="text-lg font-semibold tracking-tight">Messaging</div>
          <div className="mt-3 flex h-8 items-center rounded-lg bg-muted px-3 text-[13px] text-muted-foreground">Search messages</div>
        </div>
        {THREADS.map((thread, index) => (
          <div
            key={thread.name}
            className={cn('flex items-center gap-3 border-l-2 px-4 py-3', index === 0 ? 'border-primary bg-primary/[0.06]' : 'border-transparent')}
          >
            <Initials name={thread.name} className="size-11 text-sm" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-semibold">{thread.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{thread.when}</span>
              </div>
              <p className="truncate text-[13px] text-muted-foreground">{thread.snippet}</p>
            </div>
          </div>
        ))}
      </aside>

      <section className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border/70 px-5">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold">Grace Hopper</div>
            <div className="truncate text-xs text-muted-foreground">Rear admiral and compiler pioneer</div>
          </div>
          <div className="flex shrink-0 items-center">
            <SyncPill variant="inline" state={pill} signedIn onClick={noop} />
            <span className="ml-1 flex size-10 items-center justify-center text-lg text-muted-foreground">⋯</span>
            <span className="flex size-10 items-center justify-center text-lg text-muted-foreground">☆</span>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-6 px-6 py-6">
          <p className="text-center text-xs font-medium tracking-wide text-muted-foreground uppercase">Today</p>
          {MESSAGES.map((message, index) => (
            <div key={index} className="flex max-w-[460px] gap-3">
              <Initials name={message.name} className="size-9 text-xs" />
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold">{message.name}</span>
                  <span className="text-xs text-muted-foreground">{message.time}</span>
                </div>
                <p className="mt-0.5 text-sm leading-relaxed">{message.text}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mx-5 mb-5 h-20 shrink-0 rounded-xl bg-muted/70 px-4 py-3 text-sm text-muted-foreground">Write a message…</div>

        {showCard && (
          <div className="absolute right-6 bottom-6">
            <LinkCard
              link={pendingLink}
              total={1}
              query=""
              results={null}
              error={null}
              busy={false}
              onQueryChange={noop}
              onLink={noop}
              onCreate={noop}
              onSnooze={noop}
              onIgnore={noop}
            />
          </div>
        )}
      </section>
    </div>
  )
}

function Panel({ className }: { className?: string }) {
  return (
    <SidePanelView
      status="signedIn"
      className={className}
      me={me}
      update={null}
      health={{ status: 'ok' }}
      lastSyncAt={Date.now() - 2 * 60_000}
      lastError={null}
      pendingCount={1}
      syncing={false}
      onSyncNow={noop}
      onSignOut={noop}
      onOpenGuide={noop}
      review={null}
    />
  )
}

// ---- the shots ----

function ConversationShot() {
  return (
    <Stage>
      <Window title="Messaging" className="h-[740px] w-[1240px]">
        <Messaging pill={{ kind: 'picking' }} showCard />
      </Window>
    </Stage>
  )
}

function ReviewShot() {
  return (
    <Stage>
      <Window title="Choose what syncs" className="h-[850px] w-[980px]">
        {/* its own scroll area, so the sticky action bar pins to the window's bottom edge */}
        <div className="h-full overflow-y-auto">
          <ReviewView
            state={{ kind: 'ready', review, submitting: false, error: null }}
            className="min-h-full"
            onSearch={noResults}
            onSubmit={noop}
            onOpenLinkedIn={noop}
            onClose={noop}
          />
        </div>
      </Window>
    </Stage>
  )
}

function SidePanelShot() {
  return (
    <Stage>
      <Window title="Messaging" className="h-[740px] w-[1240px]">
        <div className="flex h-full">
          <div className="min-w-0 flex-1">
            <Messaging pill={{ kind: 'done', label: 'Synced to Attio' }} compactList />
          </div>
          <div className="w-[380px] shrink-0 border-l border-border/70">
            <Panel className="h-full" />
          </div>
        </div>
      </Window>
    </Stage>
  )
}

function SocialShot() {
  return (
    <Stage className="justify-start">
      <div className="flex w-[760px] shrink-0 flex-col gap-8 pl-[100px]">
        <AppIcon className="size-20 shadow-lg" />
        <h1 className="text-[58px] leading-[1.04] font-semibold tracking-[-0.03em] text-balance">
          Your LinkedIn conversations, on the right people in Attio.
        </h1>
        <p className="max-w-[560px] text-[24px] leading-snug text-pretty text-muted-foreground">
          An open-source Chrome extension that files the conversations you choose as notes in Attio. Fork it and run it on your
          own Vercel and Supabase.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <span className="rounded-full bg-foreground px-5 py-2.5 text-[17px] font-medium text-background">{REPOSITORY}</span>
          <span className="rounded-full bg-background/80 px-4 py-2.5 text-[17px] text-muted-foreground ring-1 ring-border">
            MIT licensed
          </span>
        </div>
      </div>

      <div className="relative h-full flex-1">
        {/* on LinkedIn: the thread header with its pill, then the prompt; the side panel beside them */}
        <div className="absolute top-[150px] left-[20px] flex h-14 w-[360px] items-center justify-between rounded-2xl bg-background px-4 shadow-[0_24px_60px_-20px_rgba(15,30,60,0.3)] ring-1 ring-black/10">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">Grace Hopper</div>
            <div className="truncate text-xs text-muted-foreground">Active now</div>
          </div>
          <SyncPill variant="inline" state={{ kind: 'picking' }} signedIn onClick={noop} />
        </div>
        <div className="absolute top-[130px] right-[50px] h-[640px] w-[360px] overflow-hidden rounded-[22px] bg-background shadow-[0_40px_90px_-24px_rgba(15,30,60,0.38)] ring-1 ring-black/10">
          <Panel className="h-full" />
        </div>
        <div className="absolute top-[240px] left-[20px] rounded-2xl shadow-[0_40px_90px_-24px_rgba(15,30,60,0.4)]">
          <LinkCard
            link={pendingLink}
            total={1}
            query=""
            results={null}
            error={null}
            busy={false}
            onQueryChange={noop}
            onLink={noop}
            onCreate={noop}
            onSnooze={noop}
            onIgnore={noop}
          />
        </div>
      </div>
    </Stage>
  )
}

const SHOTS: Record<ShotName, () => React.ReactNode> = {
  conversation: ConversationShot,
  review: ReviewShot,
  'side-panel': SidePanelShot,
  social: SocialShot,
}

/** The shots sit on a light backdrop, so the UI is shown in light mode whatever the OS uses. */
function useLightScheme() {
  useLayoutEffect(() => {
    const walk = (rules: CSSRuleList) => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSMediaRule && rule.conditionText.includes('prefers-color-scheme: dark')) rule.media.mediaText = 'not all'
        if ('cssRules' in rule) walk((rule as CSSGroupingRule).cssRules)
      }
    }
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        walk(sheet.cssRules)
      } catch {
        // cross-origin sheets can't be read; ours are same-origin
      }
    }
  }, [])
}

export function Shot({ name }: { name: ShotName }) {
  // relative times read the clock, so render only in the browser
  const inBrowser = useSyncExternalStore(subscribeNever, () => true, () => false)
  useLightScheme()
  if (!inBrowser) return null
  const Component = SHOTS[name]
  return <Component />
}
