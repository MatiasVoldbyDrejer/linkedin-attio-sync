import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Preview } from './preview'

export const metadata: Metadata = {
  title: 'Extension UI preview',
  robots: { index: false },
}

/** Dev-only gallery of the extension's views; the env check has to run on the server. */
export default function PreviewPage() {
  if (!(process.env.NODE_ENV !== 'production' || process.env.ENABLE_PREVIEW === '1')) notFound()
  return <Preview />
}
