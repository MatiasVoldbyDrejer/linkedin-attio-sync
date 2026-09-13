import type { Metadata } from 'next'
import { TooltipProvider } from '@linkedin-sync/ui/components/tooltip'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'LinkedIn → Attio Sync', template: '%s · LinkedIn → Attio Sync' },
  description: 'Keep your team’s LinkedIn conversations on the right people in Attio.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  )
}
