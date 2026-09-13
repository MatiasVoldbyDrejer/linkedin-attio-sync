import type { Metadata } from 'next'
import { Card, CardContent } from '@linkedin-sync/ui/components/card'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: 'What the LinkedIn → Attio Sync extension accesses, stores and shares.',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border/60 pt-8">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader current="/privacy" />
      <main className="flex-1 bg-muted/40">
        <div className="mx-auto max-w-3xl px-4 pt-14 pb-20 sm:px-6 sm:pt-20">
          <header className="px-1">
            <p className="text-sm font-medium text-muted-foreground">LinkedIn → Attio Sync</p>
            <h1 className="mt-2 text-4xl font-semibold sm:text-5xl">Privacy policy</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Effective <time dateTime="2026-09-13">13 September 2026</time>
            </p>
          </header>

          <Card className="mt-10">
            <CardContent className="px-6 py-3 sm:px-10 sm:py-5">
              <article className="max-w-[65ch] space-y-8 text-base leading-7 text-pretty">
                <p className="text-lg leading-8 text-muted-foreground">
                  LinkedIn → Attio Sync is a Chrome extension your organization runs for internal use. It copies LinkedIn
                  conversations that a team member chooses into the team&apos;s Attio workspace. This policy explains exactly
                  what it touches.
                </p>

                <Section title="What the extension accesses">
                  <p>
                    <strong className="font-semibold">Your LinkedIn messaging data.</strong> Using the LinkedIn session
                    already signed in to your browser, the extension requests your own inbox (your most recent
                    conversations, with the people in them and the latest message), and full message history for
                    conversations you link or ask it to sync. It only reads. It never sends messages, posts or changes
                    anything on LinkedIn.
                  </p>
                  <p>
                    <strong className="font-semibold">Your Attio identity.</strong> When you sign in with Attio, we receive
                    who you are in the team&apos;s Attio workspace (name, email and workspace), so your LinkedIn account is
                    tied to you.
                  </p>
                </Section>

                <Section title="What we store">
                  <p>Data is stored in the team&apos;s backend database (Supabase) and in Attio:</p>
                  <ul className="list-disc space-y-2 pl-5 marker:text-muted-foreground">
                    <li>
                      Your LinkedIn profile basics (name, headline, profile link) and the time zone of your browser, to
                      identify your account and format note timestamps.
                    </li>
                    <li>
                      For your recent inbox conversations: who the other participants are and when the conversation was last
                      active. Message text isn&apos;t stored for these.
                    </li>
                    <li>
                      For conversations you link to an Attio person, or that are waiting for you to pick one: the message
                      history, and which Attio person and note they belong to.
                    </li>
                    <li>Your extension session token, stored only as a one-way hash.</li>
                    <li>
                      When LinkedIn changes its data format and a response can&apos;t be read, a copy of that response is kept
                      for up to 14 days so it can be processed after a fix. The copy used to diagnose the problem has names,
                      message text and profile identifiers replaced with placeholders.
                    </li>
                  </ul>
                  <p>
                    In Attio, each conversation you link becomes a note on that person, titled with the contact and your
                    name and containing the conversation. Linking can also set the person&apos;s LinkedIn URL.
                  </p>
                </Section>

                <Section title="Who it is shared with">
                  <p>
                    Linked conversations are shared only with members of the team&apos;s Attio workspace, who can see notes
                    there. We don&apos;t sell data, use it for advertising, or share it with anyone outside the team, other
                    than the providers that host the service (Vercel for the backend, Supabase for the database, Attio for
                    the CRM) acting on our behalf.
                  </p>
                </Section>

                <Section title="Retention and deletion">
                  <p>
                    Stored data is kept while you use the extension. You can remove the extension at any time, and choose
                    &ldquo;Never for this conversation&rdquo; to stop a thread from syncing. To have your stored data deleted,
                    or to ask what is stored about you, ask your workspace admin. Notes already created in Attio can be
                    deleted in Attio by anyone with access.
                  </p>
                </Section>
              </article>
            </CardContent>
          </Card>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
