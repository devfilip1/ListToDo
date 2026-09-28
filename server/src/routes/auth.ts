import argon2 from 'argon2';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db';
import { hashToken, issueTokens } from '../lib/tokens';

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Invalid email')),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

// Hash "falso" usado quando o email não existe, para o login demorar o mesmo tempo nos dois casos.
const dummyHash = argon2.hash('senha-que-nao-existe');

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/register', async (request, reply) => {
    const { email, password } = credentialsSchema.parse(request.body);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return reply.code(409).send({ error: 'This email is already registered' });
    }

    const user = await prisma.user.create({
      data: { email, passwordHash: await argon2.hash(password) },
    });

    return reply.code(201).send(await issueTokens(user));
  });

  app.post('/auth/login', async (request, reply) => {
    const { email, password } = credentialsSchema.parse(request.body);

    const user = await prisma.user.findUnique({ where: { email } });
    const passwordOk = await argon2.verify(user?.passwordHash ?? (await dummyHash), password);

    if (!user || !passwordOk) {
      return reply.code(401).send({ error: 'Invalid email or password' });
    }

    return issueTokens(user);
  });

  app.post('/auth/refresh', async (request, reply) => {
    const { refreshToken } = refreshSchema.parse(request.body);

    const stored = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { user: true },
    });

    if (!stored || stored.expiresAt < new Date()) {
      return reply.code(401).send({ error: 'Session expired' });
    }

    // Revoga o token atual. O filtro `revokedAt: null` garante que só UM request consegue usá-lo.
    const { count } = await prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (count === 0) {
      // O token já tinha sido usado → pode ter sido roubado. Derruba todas as sessões do usuário.
      await prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return reply.code(401).send({ error: 'Session expired' });
    }

    return issueTokens(stored.user);
  });

  app.post('/auth/logout', async (request, reply) => {
    const { refreshToken } = refreshSchema.parse(request.body);

    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return reply.code(204).send();
  });
}