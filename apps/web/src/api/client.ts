import type { Issue } from '@suptron/runtime/browser';

/** The server refused a write because the file changed since it was read (412). */
export class ConflictError<T = unknown> extends Error {
  constructor(readonly current: { data: T; etag: string }) {
    super('The file changed on disk since it was loaded');
    this.name = 'ConflictError';
  }
}

/** The server refused the body (400). */
export class ValidationError extends Error {
  constructor(readonly issues: Issue[]) {
    super(issues.map((i) => i.message).join('; ') || 'Validation failed');
    this.name = 'ValidationError';
  }
}

/** A delete or rename refused because something uses the file (409). */
export class InUseError extends Error {
  constructor(
    readonly reason: string,
    readonly usedBy: { project: string; assembly: string }[] = [],
    readonly count = 0,
  ) {
    super(
      reason === 'in_use'
        ? 'The Unit is used by an Assembly'
        : 'Active Missions use a snapshot of this',
    );
    this.name = 'InUseError';
  }
}

export class NameTakenError extends Error {
  constructor() {
    super('That name is already taken');
    this.name = 'NameTakenError';
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class PreconditionRequiredError extends Error {
  constructor() {
    super('The file exists; reload it before saving');
    this.name = 'PreconditionRequiredError';
  }
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`Request failed with ${status}`);
    this.name = 'HttpError';
  }
}

export interface RequestOptions {
  method?: 'GET' | 'PUT' | 'POST' | 'DELETE';
  body?: unknown;
  etag?: string;
  force?: boolean;
  signal?: AbortSignal;
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** JSON fetch with the ETag headers and the typed errors of the API contract. */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = options.force ? `${path}${path.includes('?') ? '&' : '?'}force=1` : path;
  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.etag) headers['if-match'] = options.etag;
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers,
    ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
    ...(options.signal && { signal: options.signal }),
  });
  if (response.ok) return (await parseBody(response)) as T;
  const body = (await parseBody(response)) as Record<string, unknown> | undefined;
  switch (response.status) {
    case 400:
      throw new ValidationError((body?.issues as Issue[] | undefined) ?? []);
    case 404:
      throw new NotFoundError(typeof body?.message === 'string' ? body.message : undefined);
    case 409: {
      const reason = String(body?.reason ?? '');
      if (reason === 'name_taken') throw new NameTakenError();
      if (reason === 'in_use' || reason === 'active_missions') {
        throw new InUseError(
          reason,
          (body?.usedBy as { project: string; assembly: string }[] | undefined) ?? [],
          typeof body?.count === 'number' ? body.count : 0,
        );
      }
      throw new HttpError(409, body);
    }
    case 412:
      throw new ConflictError(
        (body?.current as { data: unknown; etag: string }) ?? { data: null, etag: '' },
      );
    case 428:
      throw new PreconditionRequiredError();
    default:
      throw new HttpError(response.status, body);
  }
}
