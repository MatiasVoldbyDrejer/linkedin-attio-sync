import { browser } from 'wxt/browser'

/** Opens the review of recent conversations, or focuses it when a tab already has it. */
export async function openReview(): Promise<void> {
  const url = browser.runtime.getURL('/review.html')
  const [existing] = await browser.tabs.query({ url })
  if (existing?.id !== undefined) {
    await browser.tabs.update(existing.id, { active: true })
    if (existing.windowId !== undefined) await browser.windows.update(existing.windowId, { focused: true })
    return
  }
  await browser.tabs.create({ url })
}
