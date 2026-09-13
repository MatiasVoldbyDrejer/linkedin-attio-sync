const ATTIO_API = 'https://api.attio.com/v2'

export class AttioError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    path: string,
  ) {
    super(`Attio ${status} on ${path}: ${body.slice(0, 300)}`)
  }
}

export interface AttioPersonSummary {
  recordId: string
  name: string
  image: string | null
  emails: string[]
}

export interface AttioPerson {
  recordId: string
  name: string
  linkedin: string | null
}

export interface AttioSelf {
  active: boolean
  workspaceId: string
  workspaceName: string
  /** The member who granted an OAuth token; null for workspace access tokens */
  memberId: string | null
}

interface SelfBody {
  active: boolean
  workspace_id: string
  workspace_name: string
  authorized_by_workspace_member_id?: string | null
}

interface RecordValues {
  name?: { full_name?: string }[]
  linkedin?: { value?: string }[]
}

function toPerson(record: { id: { record_id: string }; values: RecordValues }): AttioPerson {
  return {
    recordId: record.id.record_id,
    name: record.values.name?.[0]?.full_name ?? '',
    linkedin: record.values.linkedin?.[0]?.value ?? null,
  }
}

/** `/in/<vanity>` is the stable part of a profile URL; hosts and trailing slashes vary. */
export function linkedInVanity(profileUrl: string): string | null {
  return profileUrl.match(/linkedin\.com\/in\/([^/?#]+)/i)?.[1]?.toLowerCase() ?? null
}

export class AttioClient {
  constructor(private readonly token: string) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(ATTIO_API + path, {
      method,
      headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!res.ok) throw new AttioError(res.status, await res.text(), path)
    return (await res.json()) as T
  }

  /** Identifies the token: its workspace and, for OAuth tokens, the member who granted it. */
  async self(): Promise<AttioSelf> {
    const body = await this.request<SelfBody | { data: SelfBody }>('GET', '/self')
    const self = 'data' in body ? body.data : body
    return {
      active: self.active,
      workspaceId: self.workspace_id,
      workspaceName: self.workspace_name,
      memberId: self.authorized_by_workspace_member_id ?? null,
    }
  }

  async getWorkspaceMember(memberId: string): Promise<{ name: string; email: string | null }> {
    const { data } = await this.request<{ data: { first_name: string; last_name: string; email_address: string | null } }>(
      'GET',
      `/workspace_members/${memberId}`,
    )
    return { name: `${data.first_name} ${data.last_name}`.trim(), email: data.email_address }
  }

  async searchPeople(query: string, limit = 10): Promise<AttioPersonSummary[]> {
    const { data } = await this.request<{
      data: { id: { record_id: string }; record_text: string; record_image: string | null; email_addresses?: string[] }[]
    }>('POST', '/objects/records/search', {
      query,
      objects: ['people'],
      limit,
      request_as: { type: 'workspace' },
    })
    return data.map((r) => ({
      recordId: r.id.record_id,
      name: r.record_text,
      image: r.record_image,
      emails: r.email_addresses ?? [],
    }))
  }

  async findPersonByLinkedIn(profileUrl: string): Promise<AttioPerson | null> {
    const vanity = linkedInVanity(profileUrl)
    if (!vanity) return null
    const { data } = await this.request<{ data: { id: { record_id: string }; values: RecordValues }[] }>(
      'POST',
      '/objects/people/records/query',
      { filter: { linkedin: { value: { $contains: `/in/${vanity}` } } }, limit: 2 },
    )
    // two matches means the workspace has duplicates; don't guess
    return data.length === 1 && data[0] ? toPerson(data[0]) : null
  }

  async getPerson(recordId: string): Promise<AttioPerson> {
    const { data } = await this.request<{ data: { id: { record_id: string }; values: RecordValues } }>(
      'GET',
      `/objects/people/records/${recordId}`,
    )
    return toPerson(data)
  }

  async setPersonLinkedIn(recordId: string, profileUrl: string): Promise<void> {
    await this.request('PATCH', `/objects/people/records/${recordId}`, {
      data: { values: { linkedin: profileUrl } },
    })
  }

  async createPerson(input: { firstName: string; lastName: string; linkedin: string | null }): Promise<AttioPerson> {
    const fullName = `${input.firstName} ${input.lastName}`.trim()
    const { data } = await this.request<{ data: { id: { record_id: string }; values: RecordValues } }>(
      'POST',
      '/objects/people/records',
      {
        data: {
          values: {
            name: [{ first_name: input.firstName, last_name: input.lastName, full_name: fullName }],
            ...(input.linkedin ? { linkedin: input.linkedin } : {}),
          },
        },
      },
    )
    return toPerson(data)
  }

  async createNote(input: { recordId: string; title: string; markdown: string; createdAt?: string }): Promise<string> {
    const { data } = await this.request<{ data: { id: { note_id: string } } }>('POST', '/notes', {
      data: {
        parent_object: 'people',
        parent_record_id: input.recordId,
        title: input.title,
        format: 'markdown',
        content: input.markdown,
        ...(input.createdAt ? { created_at: input.createdAt } : {}),
      },
    })
    return data.id.note_id
  }

  async updateNote(noteId: string, input: { title: string; markdown: string }): Promise<void> {
    await this.request('PATCH', `/notes/${noteId}`, {
      data: { title: input.title, format: 'markdown', content: input.markdown },
    })
  }
}
