import type { FastifyReply, FastifyRequest } from 'fastify';
import { isGlobalStreamEvent, type MissionEvent } from '@suptron/runtime';

export const HEARTBEAT_MS = 15_000;
export const BUFFER_PER_MISSION = 5000;

interface Client {
  missionId: string | null;
  write(chunk: string): void;
}

/**
 * Fans Mission events out to SSE clients and keeps a replay buffer per Mission. The event's
 * `seq` is the SSE id, so `Last-Event-ID` and `?after=` resume without a gap or a duplicate.
 */
export class EventHub {
  private readonly buffers = new Map<string, MissionEvent[]>();
  private readonly clients = new Set<Client>();

  constructor(private readonly heartbeatMs = HEARTBEAT_MS) {}

  publish(event: MissionEvent): void {
    if (event.type === 'mission.dismissed') {
      this.buffers.delete(event.missionId);
    } else {
      const buffer = this.buffers.get(event.missionId) ?? [];
      buffer.push(event);
      if (buffer.length > BUFFER_PER_MISSION) buffer.splice(0, buffer.length - BUFFER_PER_MISSION);
      this.buffers.set(event.missionId, buffer);
    }
    const chunk = format(event);
    for (const client of this.clients) {
      if (
        client.missionId === null
          ? isGlobalStreamEvent(event)
          : client.missionId === event.missionId
      ) {
        client.write(chunk);
      }
    }
  }

  buffered(missionId: string, after: number): { events: MissionEvent[]; gap: boolean } {
    const buffer = this.buffers.get(missionId) ?? [];
    const first = buffer[0];
    // A gap exists when the client asks for events older than what the buffer still holds.
    const gap = first !== undefined ? after + 1 < first.seq : after > 0;
    return { events: buffer.filter((e) => e.seq > after), gap };
  }

  /** The Fastify handler of `GET /api/events`. */
  handle = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const query = request.query as { mission?: string; after?: string };
    const missionId = query.mission?.trim() || null;
    const header = request.headers['last-event-id'];
    const afterRaw = query.after ?? (Array.isArray(header) ? header[0] : header);
    const after = afterRaw !== undefined && /^\d+$/.test(afterRaw) ? Number(afterRaw) : 0;

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write(': connected\n\n');

    const client: Client = { missionId, write: (chunk) => reply.raw.write(chunk) };
    if (missionId !== null) {
      const { events, gap } = this.buffered(missionId, after);
      if (gap) reply.raw.write('event: resync\ndata: {}\n\n');
      else for (const event of events) reply.raw.write(format(event));
    }
    this.clients.add(client);
    const heartbeat = setInterval(() => reply.raw.write(': ping\n\n'), this.heartbeatMs);
    await new Promise<void>((resolve) => {
      request.raw.on('close', () => {
        clearInterval(heartbeat);
        this.clients.delete(client);
        resolve();
      });
    });
  };
}

export function format(event: MissionEvent): string {
  return `id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`;
}
