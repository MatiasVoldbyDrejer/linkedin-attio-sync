import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Demo } from './demo'

export const metadata: Metadata = {
  title: 'Demo',
  robots: { index: false },
}

/** Dev-only scripted demo with sample data; scripts/record-demo.mjs renders it frame by frame into docs/images/demo.mp4. */
export default function DemoPage() {
  if (!(process.env.NODE_ENV !== 'production' || process.env.ENABLE_PREVIEW === '1')) notFound()
  return <Demo />
}
