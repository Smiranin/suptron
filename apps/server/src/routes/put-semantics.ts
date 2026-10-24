import type { ConfigWriter } from '@suptron/runtime';
import type { FastifyReply, FastifyRequest } from 'fastify';

export interface PutOutcome {
  status: 200 | 201;
  etag: string;
}

function ifMatchOf(request: FastifyRequest): string | undefined {
  const header = request.headers['if-match'];
  const value = Array.isArray(header) ? header[0] : header;
  return value?.replace(/^W\//, '').replace(/^"|"$/g, '').trim() || undefined;
}

function isForced(request: FastifyRequest): boolean {
  const query = request.query as { force?: string };
  return query.force === '1' || query.force === 'true';
}

/**
 * The shared PUT contract: no `If-Match` and no `?force=1` → 201 on a new file, 428 on an existing
 * one; `If-Match` → 200 or 412 with the current document; `?force=1` → 200 always.
 * Returns null after sending an error reply.
 */
export async function putWithPreconditions(
  writer: ConfigWriter,
  relPath: string,
  text: string,
  request: FastifyRequest,
  reply: FastifyReply,
  parseCurrent: (text: string) => unknown,
): Promise<PutOutcome | null> {
  const ifMatch = ifMatchOf(request);
  if (isForced(request)) {
    const result = await writer.writeIfMatch(relPath, text, { force: true });
    if (!result.ok) throw new Error(`Forced write failed: ${result.reason}`);
    return { status: 200, etag: result.etag };
  }
  if (ifMatch !== undefined) {
    const result = await writer.writeIfMatch(relPath, text, { etag: ifMatch });
    if (result.ok) return { status: 200, etag: result.etag };
    if (result.reason === 'missing') {
      const created = await writer.writeIfMatch(relPath, text, { create: true });
      if (created.ok) return { status: 201, etag: created.etag };
      throw new Error(`Write failed: ${created.reason}`);
    }
    const current = result.current!;
    void reply
      .status(412)
      .send({ current: { data: parseCurrent(current.text), etag: current.etag } });
    return null;
  }
  const result = await writer.writeIfMatch(relPath, text, { create: true });
  if (result.ok) return { status: 201, etag: result.etag };
  void reply.status(428).send({
    reason: 'precondition_required',
    message: 'The file exists; send If-Match with its etag, or ?force=1 to overwrite',
  });
  return null;
}

/** Checks `If-Match` against an existing file before a rename, without writing. */
export async function checkPrecondition(
  writer: ConfigWriter,
  relPath: string,
  request: FastifyRequest,
  reply: FastifyReply,
  parseCurrent: (text: string) => unknown,
): Promise<boolean> {
  if (isForced(request)) return true;
  const current = await writer.read(relPath);
  if (!current) return true;
  const ifMatch = ifMatchOf(request);
  if (ifMatch === undefined) {
    void reply.status(428).send({
      reason: 'precondition_required',
      message: 'The file exists; send If-Match with its etag, or ?force=1 to overwrite',
    });
    return false;
  }
  if (ifMatch !== current.etag) {
    void reply
      .status(412)
      .send({ current: { data: parseCurrent(current.text), etag: current.etag } });
    return false;
  }
  return true;
}
