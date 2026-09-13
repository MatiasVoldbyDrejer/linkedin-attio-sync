import { LinkCard, LinkCardNotice } from '@linkedin-sync/ui/views/link-card'
import { SyncPill } from '@linkedin-sync/ui/views/sync-pill'
import { useSyncExternalStore } from 'react'
import type { HeaderSlot } from './header-slot'
import type { PanelController } from './panel'
import type { ThreadButtonController } from './thread-button'

export function ContentApp({
  panel,
  button,
  headerSlot,
}: {
  panel: PanelController
  button: ThreadButtonController
  headerSlot: HeaderSlot
}) {
  const card = useSyncExternalStore(panel.subscribe, panel.getSnapshot)
  const pill = useSyncExternalStore(button.subscribe, button.getSnapshot)
  const floatPill = useSyncExternalStore(headerSlot.subscribe, headerSlot.getSnapshot)

  return (
    // one fixed column for the card (and the pill, when the thread header has no spot for it),
    // lifted clear of LinkedIn's own Messaging bar; the empty column mustn't swallow clicks meant for LinkedIn
    <div className="pointer-events-none fixed right-4 bottom-16 z-[2147483000] flex flex-col items-end gap-2 font-sans text-[13px] leading-normal text-foreground antialiased *:pointer-events-auto">
      {card.kind === 'notice' && <LinkCardNotice text={card.text} />}
      {card.kind === 'card' && (
        <LinkCard
          // a fresh card per conversation, so tooltips and the entrance animation reset
          key={card.link.conversationUrn}
          link={card.link}
          total={card.total}
          query={card.query}
          results={card.results}
          error={card.error}
          busy={card.busy}
          onQueryChange={panel.search}
          onLink={(person) => panel.link(card.link, person)}
          onCreate={() => panel.create(card.link)}
          onSnooze={() => panel.snooze(card.link)}
          onIgnore={() => panel.ignore(card.link)}
        />
      )}
      {floatPill && (
        <SyncPill hidden={pill.threadId === null} state={pill.state} signedIn={pill.signedIn} onClick={button.click} />
      )}
    </div>
  )
}

/** The Sync pill in LinkedIn's thread header, beside the conversation's ⋯ and ☆ buttons. */
export function HeaderPillApp({ button }: { button: ThreadButtonController }) {
  const pill = useSyncExternalStore(button.subscribe, button.getSnapshot)

  return (
    <div className="flex font-sans leading-normal text-foreground antialiased">
      <SyncPill
        variant="inline"
        hidden={pill.threadId === null}
        state={pill.state}
        signedIn={pill.signedIn}
        onClick={button.click}
      />
    </div>
  )
}
