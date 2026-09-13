'use client'

import { Tooltip } from '@base-ui/react/tooltip'
import type { AttioPersonSummary, PendingLink } from '@linkedin-sync/core'
import { CheckCircle2Icon, PlusIcon, SearchIcon } from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '@linkedin-sync/ui/components/avatar'
import { Button } from '@linkedin-sync/ui/components/button'
import { Input } from '@linkedin-sync/ui/components/input'
import { cn } from '@linkedin-sync/ui/lib/utils'
import { usePortalContainer } from '@linkedin-sync/ui/views/portal-container'
import { initials } from '@linkedin-sync/ui/views/shared'
import { glass } from '@linkedin-sync/ui/views/sync-pill'

export interface LinkCardProps {
  link: PendingLink
  /** Cards waiting, including this one */
  total: number
  query: string
  /** Search results, or null while the search box is empty */
  results: AttioPersonSummary[] | null
  error: string | null
  busy: boolean
  onQueryChange: (value: string) => void
  onLink: (person: AttioPersonSummary) => void
  onCreate: () => void
  onSnooze: () => void
  onIgnore: () => void
  className?: string
}

const surface = cn(glass, 'w-[360px] max-w-[calc(100vw-32px)] rounded-2xl')

function PersonAvatar({ name, image }: { name: string; image: string | null }) {
  return (
    <Avatar className="size-8">
      {/* LinkedIn's CSP may block Attio's image host; the initials show instead */}
      {image && <AvatarImage src={image} alt="" />}
      <AvatarFallback className="bg-linear-to-b from-muted-foreground/55 to-muted-foreground/75 text-[11px] font-semibold text-background">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  )
}

/** One line of secondary text; hovering shows all of it. */
function Truncated({ text }: { text: string }) {
  const container = usePortalContainer()
  return (
    <Tooltip.Root>
      <Tooltip.Trigger render={<p />} className="truncate text-xs text-muted-foreground">
        {text}
      </Tooltip.Trigger>
      <Tooltip.Portal container={container}>
        <Tooltip.Positioner side="top" sideOffset={6} className="isolate z-[2147483647]">
          <Tooltip.Popup className="max-w-72 origin-(--transform-origin) rounded-lg bg-foreground px-2.5 py-1.5 text-xs leading-snug text-background shadow-lg data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            {text}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

function PersonList({
  people,
  busy,
  onLink,
}: {
  people: AttioPersonSummary[]
  busy: boolean
  onLink: (person: AttioPersonSummary) => void
}) {
  if (people.length === 0) return null
  return (
    <ul className="flex flex-col overflow-hidden rounded-xl bg-foreground/[0.04] dark:bg-foreground/[0.06]">
      {people.map((person) => (
        <li
          key={person.recordId}
          className="relative flex items-center gap-2.5 px-2.5 py-2 not-last:after:absolute not-last:after:right-0 not-last:after:bottom-0 not-last:after:left-[52px] not-last:after:h-px not-last:after:bg-border/70"
        >
          <PersonAvatar name={person.name} image={person.image} />
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="truncate text-[13px] leading-snug font-medium">{person.name}</p>
            {person.emails[0] && <p className="truncate text-xs leading-snug text-muted-foreground">{person.emails[0]}</p>}
          </div>
          <Button
            size="xs"
            variant="secondary"
            disabled={busy}
            onClick={() => onLink(person)}
            className="rounded-full bg-primary/10 px-2.5 text-link hover:bg-primary/15 dark:bg-primary/20 dark:hover:bg-primary/25"
          >
            This is them
          </Button>
        </li>
      ))}
    </ul>
  )
}

/** Bottom-right card asking which Attio person an unlinked LinkedIn thread belongs to. */
export function LinkCard({
  link,
  total,
  query,
  results,
  error,
  busy,
  onQueryChange,
  onLink,
  onCreate,
  onSnooze,
  onIgnore,
  className,
}: LinkCardProps) {
  const name = `${link.contact.firstName} ${link.contact.lastName}`.trim()
  return (
    <section
      aria-label="Sync to Attio?"
      className={cn(
        surface,
        'flex max-h-[min(560px,calc(100vh-136px))] flex-col gap-2.5 overflow-y-auto overscroll-contain p-3 animate-in fade-in-0 slide-in-from-bottom-2 duration-300 ease-out',
        className,
      )}
    >
      <header className="flex items-baseline justify-between gap-2 px-1">
        <h2 className="text-[13px] font-semibold tracking-tight">Sync to Attio?</h2>
        {total > 1 && <span className="text-xs text-muted-foreground tabular-nums">1 of {total}</span>}
      </header>

      <p className="-mt-1 px-1 text-[13px] leading-snug text-muted-foreground">
        Which Attio person is <strong className="font-medium text-foreground">{name}</strong>?
      </p>

      <div className="flex items-center gap-2.5 px-1">
        <Avatar className="size-10">
          <AvatarFallback className="bg-linear-to-b from-primary/70 to-primary text-sm font-semibold text-primary-foreground">
            {initials(name)}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="truncate text-[13px] leading-snug font-semibold">{name}</p>
          {link.contact.headline && <Truncated text={link.contact.headline} />}
        </div>
      </div>

      <PersonList people={link.suggestions} busy={busy} onLink={onLink} />

      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Search Attio people"
          placeholder="Search Attio people…"
          value={query}
          disabled={busy}
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          className="h-8 rounded-full border-transparent bg-foreground/[0.06] pl-8 text-[13px] md:text-[13px] dark:bg-foreground/10"
        />
      </div>

      <PersonList people={results ?? []} busy={busy} onLink={onLink} />

      {error && (
        <p role="alert" className="px-1 text-xs leading-snug text-destructive">
          {error}
        </p>
      )}

      <Button disabled={busy} onClick={onCreate} className="h-8 w-full rounded-full text-[13px]">
        <PlusIcon strokeWidth={2.5} />
        <span className="truncate">Create “{name}” in Attio</span>
      </Button>

      <footer className="-mx-1 -mb-1 flex items-center justify-between gap-1">
        <Button variant="ghost" size="sm" disabled={busy} onClick={onSnooze} className="rounded-full text-xs text-muted-foreground">
          Not now
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={onIgnore} className="rounded-full text-xs text-muted-foreground">
          Never for this conversation
        </Button>
      </footer>
    </section>
  )
}

/** What the card turns into for a moment after a choice. */
export function LinkCardNotice({ text, className }: { text: string; className?: string }) {
  return (
    <p
      role="status"
      className={cn(
        surface,
        'flex items-center gap-2 px-3.5 py-3 text-[13px] font-medium animate-in fade-in-0 zoom-in-95 duration-200',
        className,
      )}
    >
      <CheckCircle2Icon className="size-4 shrink-0 text-green-600 dark:text-green-400" />
      {text}
    </p>
  )
}
