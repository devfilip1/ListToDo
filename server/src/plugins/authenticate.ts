import type { FastifyReply, FastifyRequest } from 'fastify';
import { verifyAccessToken } from '../lib/tokens';

declare module 'fastify' {
  interface FastifyRequest {
    user: { id: string; email: string };
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const header = request.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Not authenticated' });
  }

  const token = header.slice('Bearer '.length);

  try {
    request.user = await verifyAccessToken(token);
  } catch {
    return reply.code(401).send({ error: 'Not authenticated' });
  }
}