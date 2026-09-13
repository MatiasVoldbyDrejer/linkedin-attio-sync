# Self-healing

linkedin-sync reads LinkedIn through the internal Voyager API that linkedin.com uses. LinkedIn changes it without notice. This loop turns most of those changes into a merged fix and a deploy without a human, and no data is lost in the meantime.

## The loop

```
extension ──raw responses──▶ backend /api/sync ──parse──▶ Supabase + Attio
                                   │ failure
                                   ▼
                          incident (one per fingerprint)
                                   │ POST /fire (scrubbed IncidentPayload)
                                   ▼
                     Claude Code routine "linkedin-sync self-heal"
                                   │ fixture + fix, PR on claude/self-heal-*, label self-heal
                                   ▼
                              CI (ci.yml)
                                   │ success
                                   ▼
                  self-heal-automerge.yml: scope check ──out of scope──▶ needs-human-review
                                   │ in scope
                                   ▼
                    squash-merge to main ──▶ Vercel deploy
                                   │ first sync on the new build
                                   ▼
            replay failed_fetches ──▶ incident resolved
```

1. **Detection.** Every response is parsed as it arrives. Responses that fail to apply are stored in `failed_fetches` (successful ones aren't kept; an inbox poll every minute would be hundreds of MB a day). It flags three kinds of failure:
   - `parse_error`: a response no longer matches the zod schemas in `packages/core/src/linkedin/parse.ts`.
   - `fetch_failed`: LinkedIn rejected the request, usually because a `queryId` rotated.
   - `canary`: the response parsed but is implausible, such as an empty inbox.

   A 401/403 or a login redirect is `auth_required` instead. Only you can fix that, so no agent is dispatched and the extension shows a badge.
2. **Incident.** Failures are grouped by `incidentFingerprint(kind, request, issuePaths)`, with array indexes normalized. The database allows one live incident per fingerprint, so a thousand failing fetches become one incident.
3. **Dispatch.** The backend posts a scrubbed `IncidentPayload` (`packages/core/src/incident.ts`) as `text` to the routine's `/fire` endpoint. The payload includes `observedRequests`: the request paths LinkedIn's own web app used recently, taken from your open LinkedIn tabs. That's how the agent learns a rotated `queryId` without logging in.
4. **Fix.** The routine follows `.claude/self-heal/ROUTINE_PROMPT.md`. It commits the sample as a fixture, reproduces the failure, fixes the parser or request config, and opens a PR labeled `self-heal`.
5. **CI.** `ci.yml` runs the core tests. Every fixture ever captured is replayed, so a fix can't break yesterday's response shape.
6. **Scoped auto-merge.** `self-heal-automerge.yml` merges only when all of these hold:
   - CI passed on the exact head commit.
   - The branch is `claude/*`, the PR is labeled `self-heal`, and you're the author (routines act as you).
   - Every changed file matches `.github/self-heal-allowlist`.
   - `baseUrl` in `request-config.json` still points at `https://www.linkedin.com`.

   If any check fails, the PR gets `needs-human-review` and a comment that tags you.
7. **Deploy and replay.** Vercel deploys `main`. On the first sync after a deploy, the backend reprocesses `failed_fetches` recorded under an older build. Messages received during the outage are recovered and the incident is marked resolved.

## Guardrails

- **Scrubbing.** Nothing personal leaves the backend. `scrubPayload` replaces names, message text and URLs with deterministic placeholders and keeps structure and cross-references intact. Fixtures are committed only in scrubbed form.
- **Allowlist read from `main`.** The workflow checks out the default branch and never runs PR code. A PR can't widen its own scope. The scope script also hard-blocks `.github/**`, `apps/**`, `packages/core/src/attio/**`, `package.json` files and the lockfile, whatever the allowlist says.
- **Origin enforcement.** The extension only executes requests whose config `baseUrl` is `https://www.linkedin.com`. The auto-merge rejects any PR that changes that origin.
- **One live incident per fingerprint.** A unique index on `incidents (fingerprint) where status <> 'resolved'`.
- **Dispatch rate limit.** The backend fires the routine at most once per incident. An incident whose dispatch was skipped (routine not configured, or the cap below was hit) is retried when the failure recurs. Total dispatches are capped at 3 per 24 hours, so a flapping failure can't burn through the routine run cap.
- **Humans for everything else.** Auth problems, out-of-scope fixes and draft PRs, where the agent wasn't confident, all wait for you.

## One-time setup

1. **Install the Claude GitHub App** on your fork (`<owner>/<repo>`): https://github.com/apps/claude
2. **Create the label** the routine applies and auto-merge requires:
   ```bash
   gh label create self-heal --color 0E8A16 --description "Automated LinkedIn API fix"
   ```
3. **Create the routine** at https://claude.ai/code/routines → New routine:
   - Name: `linkedin-sync self-heal`
   - Prompt: the contents of `.claude/self-heal/ROUTINE_PROMPT.md`
   - Repository: your fork (`<owner>/<repo>`)
   - Environment: Default (Trusted network access is enough, since it only needs the npm registry). Optional setup script: `npm i -g pnpm@10.30.3`
   - Connectors: remove all. The routine only needs the repository.
4. **Add an API trigger.** Edit routine → Select a trigger → Add another trigger → API. Copy the URL, then click **Generate token** and copy it right away, because it's shown only once.
5. **Give the backend the trigger**, in Vercel project settings or the CLI:
   ```bash
   vercel env add CLAUDE_ROUTINE_FIRE_URL production   # https://api.anthropic.com/v1/claude_code/routines/<id>/fire
   vercel env add CLAUDE_ROUTINE_TOKEN production      # the generated token
   ```
   The backend calls it like this:
   ```bash
   curl -X POST "$CLAUDE_ROUTINE_FIRE_URL" \
     -H "Authorization: Bearer $CLAUDE_ROUTINE_TOKEN" \
     -H "anthropic-beta: experimental-cc-routine-2026-04-01" \
     -H "anthropic-version: 2023-06-01" \
     -H "Content-Type: application/json" \
     -d '{"text": "<IncidentPayload JSON>"}'
   ```
6. **Allow GitHub Actions to merge.** Settings → Actions → General → Workflow permissions: "Read and write permissions".

## Limits to know

- Routines are a research preview, and the `/fire` beta header may change. Breaking changes ship under a new dated header.
- Routine runs count against your claude.ai plan's **daily routine run cap** and usage limits. When the cap is hit, `/fire` is rejected until the window resets. The incident stays open and the backend retries after the cooldown.
- Squash merges made with `GITHUB_TOKEN` don't trigger other workflows. Vercel's Git integration still deploys `main` on push.
- Some changes can't be fixed from a scrubbed sample. If LinkedIn moves message text to a structure with no equivalent in the sample, the routine opens a draft PR and you finish it.
