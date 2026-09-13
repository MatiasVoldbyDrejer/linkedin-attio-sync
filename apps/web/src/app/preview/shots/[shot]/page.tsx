import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SHOT_NAMES, type ShotName } from '../shot-names'
import { Shot } from '../shots'

export const metadata: Metadata = {
  title: 'Screenshot',
  robots: { index: false },
}

const isShot = (name: string): name is ShotName => (SHOT_NAMES as readonly string[]).includes(name)

/** Dev-only compositions with sample data, captured into docs/images by scripts/capture-screenshots.mjs. */
export default async function ShotPage({ params }: PageProps<'/preview/shots/[shot]'>) {
  if (!(process.env.NODE_ENV !== 'production' || process.env.ENABLE_PREVIEW === '1')) notFound()
  const { shot } = await params
  if (!isShot(shot)) notFound()
  return <Shot name={shot} />
}
