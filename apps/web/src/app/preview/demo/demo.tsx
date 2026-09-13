'use client'

import type { AttioPersonSummary, ReviewResponse } from '@linkedin-sync/core'
import { LinkCardNotice } from '@linkedin-sync/ui/views/link-card'
import { ReviewView, type ReviewViewState } from '@linkedin-sync/ui/views/review-view'
import { AppIcon } from '@linkedin-sync/ui/views/shared'
import type { SyncPillState } from '@linkedin-sync/ui/views/sync-pill'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type * as React from 'react'
import { flushSync } from 'react-dom'
import { Messaging, REPOSITORY, review, SampleLinkCard, Stage, useLightScheme, Window } from '../shots/shots'

/**
 * A scripted walkthrough driven entirely by a timeline, so every frame is reproducible:
 * `window.__demo.seek(ms)` renders the moment at `ms`. The recorder seeks frame by frame;
 * opened normally, the page plays itself in real time.
 */
const DURATION_MS = 24_000

const noop = () => {}
const noResults = async () => []
const subscribeNever = () => noop

// ---- timing helpers ----

const clamp = (value: number) => Math.min(1, Math.max(0, value))
const progress = (t: number, start: number, end: number) => clamp((t - start) / (end - start))
const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2)
/** Eased in over [inStart, inEnd] and out over [outStart, outEnd] */
const fade = (t: number, inStart: number, inEnd: number, outStart: number, outEnd: number) =>
  Math.min(ease(progress(t, inStart, inEnd)), 1 - ease(progress(t, outStart, outEnd)))

// ---- the script ----

const SYNC_CLICK = 4500
const SYNCED = 5700
const PICK_CLICK = 7500
const PICKED = 7700
const USE_MATCHES_CLICK = 14800
const MATCHES_USED = 14900
const SUBMIT_CLICK = 16300
const SUBMITTED = 17200

type Target = 'pill' | 'thisIsThem' | 'useAllMatches' | 'submit'

/** Each stretch of cursor movement: where it starts, then moves to targets in order */
const CURSOR_SPANS: { from: number; to: number; start: { x: number; y: number }; moves: { start: number; end: number; target: Target }[] }[] = [
  {
    from: 3200,
    to: 11400,
    start: { x: 1180, y: 700 },
    moves: [
      { start: 3400, end: 4400, target: 'pill' },
      { start: 6300, end: 7300, target: 'thisIsThem' },
    ],
  },
  {
    from: 13300,
    to: 19200,
    start: { x: 980, y: 760 },
    moves: [
      { start: 13600, end: 14600, target: 'useAllMatches' },
      { start: 15300, end: 16200, target: 'submit' },
    ],
  },
]
const CLICKS = [SYNC_CLICK, PICK_CLICK, USE_MATCHES_CLICK, SUBMIT_CLICK]

const hedyMatch: AttioPersonSummary = { recordId: 'r7', name: 'Hedy Lamarr', image: null, emails: ['hedy@example.com'] }

/** Hedy has an Attio match but was dismissed before, so "Use all matches" has something to do */
const reviewWithHedy = (ignored: boolean): ReviewResponse => ({
  ...review,
  items: review.items.map((item) => (item.contact.firstName === 'Hedy' ? { ...item, match: hedyMatch, ignored } : item)),
})
const reviewBefore = reviewWithHedy(true)
const reviewAfter = reviewWithHedy(false)

// ---- cursor ----

const lastSeen = new Map<Target, { x: number; y: number }>()

function locate(target: Target): { x: number; y: number } | undefined {
  const buttons = Array.from(document.querySelectorAll('button'))
  const text = (button: HTMLButtonElement) => button.textContent?.trim() ?? ''
  const element =
    target === 'pill'
      ? document.querySelector('[data-demo=pill] button')
      : target === 'thisIsThem'
        ? buttons.find((b) => text(b) === 'This is them')
        : target === 'useAllMatches'
          ? buttons.find((b) => text(b) === 'Use all matches')
          : buttons.find((b) => /^Sync \d+ conversation/.test(text(b)))
  if (element) {
    const rect = element.getBoundingClientRect()
    lastSeen.set(target, { x: rect.left + rect.width * 0.55, y: rect.top + rect.height * 0.6 })
  }
  // a button can disappear right after its click; the cursor stays where it was
  return lastSeen.get(target)
}

function placeCursor(t: number, cursor: HTMLDivElement | null, ripple: HTMLDivElement | null) {
  if (!cursor || !ripple) return
  const span = CURSOR_SPANS.find((s) => t >= s.from && t <= s.to)
  if (!span) {
    cursor.style.opacity = '0'
    return
  }

  let point = span.start
  for (const move of span.moves) {
    const destination = locate(move.target) ?? point
    if (t >= move.end) {
      point = destination
      continue
    }
    if (t > move.start) {
      const p = ease(progress(t, move.start, move.end))
      point = { x: point.x + (destination.x - point.x) * p, y: point.y + (destination.y - point.y) * p }
    }
    break
  }

  const click = CLICKS.find((c) => t >= c && t < c + 450)
  const pressed = click !== undefined && t < click + 160
  cursor.style.opacity = String(fade(t, span.from, span.from + 250, span.to - 300, span.to))
  // the arrow's tip sits at (5, 3) inside its 30px box
  cursor.style.transform = `translate(${point.x - 5}px, ${point.y - 3}px) scale(${pressed ? 0.88 : 1})`
  const rippleProgress = click === undefined ? 1 : progress(t, click, click + 450)
  ripple.style.opacity = String(click === undefined ? 0 : 0.35 * (1 - rippleProgress))
  ripple.style.transform = `scale(${0.3 + rippleProgress * 1.2})`
}

// ---- scenes ----

function Layer({ opacity, children }: { opacity: number; children: React.ReactNode }) {
  if (opacity <= 0) return null
  return (
    <div className="absolute inset-0" style={{ opacity }}>
      {children}
    </div>
  )
}

function Caption({ children }: { children: React.ReactNode }) {
  return (
    <p className="absolute inset-x-0 top-[62px] text-center text-[46px] leading-tight font-semibold tracking-[-0.03em] text-[#1d1d1f]">
      {children}
    </p>
  )
}

/** Rises a few pixels into place as it fades in */
function Rise({ t, start, children }: { t: number; start: number; children: React.ReactNode }) {
  return <div style={{ transform: `translateY(${(1 - ease(progress(t, start, start + 800))) * 36}px)` }}>{children}</div>
}

function TitleCard({ eyebrow, first, second, footer }: { eyebrow?: string; first: string; second: string; footer?: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <AppIcon className="size-[84px] shadow-lg" />
      {eyebrow && <p className="mt-7 text-[26px] font-medium tracking-[-0.01em] text-[#86868b]">{eyebrow}</p>}
      <h1 className="mt-3 text-[76px] leading-[1.04] font-semibold tracking-[-0.035em] text-[#1d1d1f]">
        {first}
        <br />
        <span className="text-[#86868b]">{second}</span>
      </h1>
      {footer}
    </div>
  )
}

function Scenes({ t }: { t: number }) {
  const pill: SyncPillState =
    t < SYNC_CLICK + 100
      ? { kind: 'idle' }
      : t < SYNCED
        ? { kind: 'busy', label: 'Syncing…' }
        : t < PICKED
          ? { kind: 'picking' }
          : { kind: 'done', label: 'Synced to Attio' }

  let card: React.ReactNode = null
  if (t >= SYNCED && t < PICKED) {
    const shown = ease(progress(t, SYNCED, SYNCED + 400))
    card = (
      <div style={{ opacity: shown, transform: `translateY(${(1 - shown) * 16}px)` }}>
        <SampleLinkCard />
      </div>
    )
  } else if (t >= PICKED && t < 10_200) {
    card = (
      <div style={{ opacity: fade(t, PICKED, PICKED + 250, 9800, 10_200) }}>
        <LinkCardNotice text="Synced to Grace Hopper in Attio" />
      </div>
    )
  }

  const reviewState: ReviewViewState =
    t < SUBMIT_CLICK + 100
      ? { kind: 'ready', review: t < MATCHES_USED ? reviewBefore : reviewAfter, submitting: false, error: null }
      : t < SUBMITTED
        ? { kind: 'ready', review: reviewAfter, submitting: true, error: null }
        : { kind: 'done', synced: 4, failed: 0, alreadyDone: false }

  return (
    <>
      <Layer opacity={fade(t, 0, 700, 2000, 2500)}>
        <Rise t={t} start={0}>
          <div className="h-screen">
            <TitleCard eyebrow="LinkedIn → Attio Sync" first="Your LinkedIn conversations." second="Right in Attio." />
          </div>
        </Rise>
      </Layer>

      <Layer opacity={fade(t, 2400, 3100, 11_700, 12_300)}>
        <Caption>Sync any conversation in one click.</Caption>
        <Rise t={t} start={2400}>
          <div className="absolute top-[150px] left-1/2 w-[1240px] origin-top -translate-x-1/2 scale-[0.84]">
            <Window title="Messaging" className="h-[740px] w-[1240px] shadow-[0_50px_120px_-30px_rgba(15,30,60,0.35)]">
              <Messaging pill={pill} card={card} />
            </Window>
          </div>
        </Rise>
      </Layer>

      <Layer opacity={fade(t, 12_200, 12_900, 19_500, 20_100)}>
        <Caption>Choose what syncs when you sign in.</Caption>
        <Rise t={t} start={12_200}>
          <div className="absolute top-[150px] left-1/2 w-[980px] origin-top -translate-x-1/2 scale-[0.8]">
            <Window title="Choose what syncs" className="h-[850px] w-[980px] shadow-[0_50px_120px_-30px_rgba(15,30,60,0.35)]">
              <div className="h-full overflow-y-auto">
                <ReviewView
                  // a remount picks up the new starting choices after "Use all matches"
                  key={t < MATCHES_USED ? 'before' : 'after'}
                  state={reviewState}
                  className="min-h-full"
                  onSearch={noResults}
                  onSubmit={noop}
                  onOpenLinkedIn={noop}
                  onClose={noop}
                />
              </div>
            </Window>
          </div>
        </Rise>
      </Layer>

      <Layer opacity={fade(t, 20_000, 20_700, DURATION_MS + 1, DURATION_MS + 2)}>
        <Rise t={t} start={20_000}>
          <div className="h-screen">
            <TitleCard
              first="Open source."
              second="Make it yours."
              footer={
                <>
                  <p className="mt-6 text-[26px] tracking-[-0.01em] text-[#6e6e73]">
                    A Chrome extension and backend you run on your own Vercel and Supabase.
                  </p>
                  <p className="mt-3 text-[23px] tracking-[-0.01em] text-[#0066cc]">{REPOSITORY} ›</p>
                </>
              }
            />
          </div>
        </Rise>
      </Layer>
    </>
  )
}

// CSS animations run on the wall clock, which frame-by-frame recording doesn't follow; the
// timeline does all the motion, and spinners turn with it
const FRAME_CSS = `
*, *::before, *::after { animation: none !important; transition: none !important; }
[data-slot=spinner] { transform: rotate(var(--demo-spin, 0deg)); }
`

export function Demo() {
  const inBrowser = useSyncExternalStore(subscribeNever, () => true, () => false)
  useLightScheme()
  const [t, setT] = useState(0)
  const cursor = useRef<HTMLDivElement>(null)
  const ripple = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!inBrowser) return
    const demo = {
      duration: DURATION_MS,
      async seek(ms: number) {
        flushSync(() => setT(ms))
        document.documentElement.style.setProperty('--demo-spin', `${(ms * 0.45) % 360}deg`)
        placeCursor(ms, cursor.current, ripple.current)
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      },
    }
    ;(window as unknown as { __demo?: typeof demo }).__demo = demo

    // the recorder passes ?record and seeks itself; otherwise loop in real time
    if (new URLSearchParams(location.search).has('record')) return
    const startedAt = performance.now()
    let frame = requestAnimationFrame(function play() {
      void demo.seek((performance.now() - startedAt) % DURATION_MS)
      frame = requestAnimationFrame(play)
    })
    return () => cancelAnimationFrame(frame)
  }, [inBrowser])

  if (!inBrowser) return null
  return (
    <Stage plain className="block">
      <style>{FRAME_CSS}</style>
      <Scenes t={t} />
      <div ref={cursor} className="pointer-events-none absolute top-0 left-0 z-50 origin-top-left" style={{ opacity: 0 }}>
        <div ref={ripple} className="absolute top-[-17px] left-[-15px] size-10 rounded-full bg-[#0071e3]" style={{ opacity: 0 }} />
        <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden className="relative drop-shadow-[0_2px_3px_rgba(0,0,0,0.25)]">
          <path d="M4 2.4 4 19.2 8.6 15 11.6 21.7 14.5 20.4 11.5 13.9 17.7 13.9Z" fill="#111" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      </div>
    </Stage>
  )
}
