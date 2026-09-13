import type { MeResponse } from '@linkedin-sync/core'
import { ArrowDownCircleIcon, ArrowRightLeftIcon } from 'lucide-react'
import type * as React from 'react'

import { Avatar, AvatarFallback } from '@linkedin-sync/ui/components/avatar'
import { cn } from '@linkedin-sync/ui/lib/utils'

/** Pieces shared by the extension's side panel, welcome page and LinkedIn card. */

export interface UpdateInfo {
  version: string
  downloadUrl: string
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')
}

/** The app's glyph: a blue squircle tile, like a macOS app icon. */
export function AppIcon({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-[28%] bg-linear-to-b from-primary/80 to-primary text-primary-foreground shadow-sm ring-1 ring-black/5 ring-inset',
        className,
      )}
    >
      <ArrowRightLeftIcon className="size-[52%]" strokeWidth={2.25} />
    </div>
  )
}

/** iOS Settings-style inset group of rows. */
export function Group({ className, ...props }: React.ComponentProps<'div'>) {
  return <div role="list" className={cn('flex flex-col overflow-hidden rounded-xl bg-muted', className)} {...props} />
}

/** One row of a Group, with a hairline inset past its leading media. */
export function Row({
  media,
  title,
  description,
  trailing,
  className,
}: {
  media?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  trailing?: React.ReactNode
  className?: string
}) {
  return (
    <div
      role="listitem"
      className={cn(
        'relative flex min-h-11 items-center gap-3 px-3 py-2 text-[13px] not-last:after:absolute not-last:after:right-0 not-last:after:bottom-0 not-last:after:h-px not-last:after:bg-border/70',
        media ? 'not-last:after:left-12' : 'not-last:after:left-3',
        className,
      )}
    >
      {media}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="leading-snug font-medium">{title}</div>
        {description && <div className="text-xs leading-snug text-muted-foreground">{description}</div>}
      </div>
      {trailing && <div className="shrink-0 text-muted-foreground">{trailing}</div>}
    </div>
  )
}

/** Small rounded tile for a row's leading icon. */
export function RowIcon({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      aria-hidden
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground [&_svg]:size-4',
        className,
      )}
      {...props}
    />
  )
}

export function PersonAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <Avatar className={cn('size-7', className)}>
      <AvatarFallback className="bg-linear-to-b from-muted-foreground/60 to-muted-foreground/80 text-[11px] font-semibold text-background">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  )
}

/** The signed-in Attio user and their LinkedIn account, as rows. */
export function AccountRows({ me }: { me: MeResponse | undefined }) {
  if (!me) return <Row title="Signed in with Attio" />
  return (
    <>
      <Row
        media={<PersonAvatar name={me.user.name} />}
        title={`Signed in as ${me.user.name}`}
        description={me.workspaceName}
      />
      <Row
        media={
          <RowIcon className="text-[13px] font-bold tracking-tight">
            <span>in</span>
          </RowIcon>
        }
        title="LinkedIn"
        description={me.linkedIn ? me.linkedIn.name : 'Open LinkedIn to connect your account'}
      />
    </>
  )
}

/** Nudge for teammates on an unpacked build that's behind. */
export function UpdateBanner({ update, className }: { update: UpdateInfo; className?: string }) {
  return (
    <a
      href={update.downloadUrl}
      target="_blank"
      rel="noopener"
      className={cn(
        'flex items-start gap-2.5 rounded-xl bg-primary/10 px-3 py-2.5 text-[13px] transition-colors outline-none hover:bg-primary/15 focus-visible:ring-3 focus-visible:ring-ring/30',
        className,
      )}
    >
      <ArrowDownCircleIcon className="mt-px size-4 shrink-0 text-link" />
      <span className="flex flex-col gap-0.5">
        <span className="font-medium text-link">Update available ({update.version}) — download</span>
        <span className="text-xs text-muted-foreground">
          Then reload the extension at chrome://extensions and refresh your LinkedIn tabs.
        </span>
      </span>
    </a>
  )
}
