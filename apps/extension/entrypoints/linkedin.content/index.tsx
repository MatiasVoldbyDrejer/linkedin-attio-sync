import '../../assets/tailwind.css'
import { PortalContainerProvider } from '@linkedin-sync/ui/views/portal-container'
import { createRoot } from 'react-dom/client'
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root'
import { defineContentScript } from 'wxt/utils/define-content-script'
import { sendToBackground } from '../../lib/messages'
import { collectObservedRequests } from '../../lib/observed'
import { ContentApp, HeaderPillApp } from './app'
import { createHeaderSlot } from './header-slot'
import { createPanel } from './panel'
import { createThreadButton } from './thread-button'

const OBSERVE_INTERVAL_MS = 60_000
/** The thread header row is [profile link][⋯ actions][☆ star]; the pill goes just before ⋯ */
const HEADER_ANCHOR = '.msg-title-bar .msg-thread-actions__dropdown'

export default defineContentScript({
  matches: ['https://www.linkedin.com/*'],
  // WXT puts the CSS in the shadow root and hoists its @property rules into the page,
  // where Chrome registers them (it ignores @property inside shadow roots)
  cssInjectionMode: 'ui',

  async main(ctx) {
    const reportObserved = () => {
      const paths = collectObservedRequests()
      if (paths.length > 0) sendToBackground({ type: 'observedRequests', paths }).catch(() => {})
    }
    ctx.setTimeout(reportObserved, 5_000)
    ctx.setInterval(reportObserved, OBSERVE_INTERVAL_MS)

    // shared by both UIs; the header one comes and goes as LinkedIn re-renders the thread header
    const panel = createPanel()
    const button = createThreadButton(ctx, panel)
    const headerSlot = createHeaderSlot()
    ctx.onInvalidated(() => {
      button.unmount()
      panel.unmount()
      headerSlot.dispose()
    })

    const floating = await createShadowRootUi(ctx, {
      name: 'attio-sync-panel',
      position: 'inline',
      anchor: 'body',
      // typing in the search box mustn't trigger LinkedIn's keyboard shortcuts
      isolateEvents: ['keydown', 'keyup', 'keypress'],
      onMount: (container) => {
        const root = createRoot(container)
        root.render(
          // popups portal into the shadow root, where the styles are
          <PortalContainerProvider value={container}>
            <ContentApp panel={panel} button={button} headerSlot={headerSlot} />
          </PortalContainerProvider>,
        )
        return root
      },
      onRemove: (root) => root?.unmount(),
    })
    floating.mount()

    const header = await createShadowRootUi(ctx, {
      name: 'attio-sync-button',
      position: 'inline',
      anchor: HEADER_ANCHOR,
      append: 'before',
      onMount: (container, _shadow, host) => {
        // the row spaces its children apart: keep the pill beside ⋯ and let the name truncate,
        // with its status note hanging below the header over the messages
        Object.assign(host.style, {
          display: 'flex',
          alignItems: 'center',
          flex: 'none',
          marginLeft: 'auto',
          marginRight: '4px',
          position: 'relative',
          zIndex: '10',
        })
        const root = createRoot(container)
        root.render(<HeaderPillApp button={button} />)
        headerSlot.mounted()
        return root
      },
      onRemove: (root) => {
        root?.unmount()
        headerSlot.removed()
      },
    })
    header.autoMount()
  },
})
