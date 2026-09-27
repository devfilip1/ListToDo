import cors from '@fastify/cors';
import Fastify, { type FastifyError } from 'fastify';
import { ZodError } from 'zod';
import { prisma } from './db';
import { authRoutes } from './routes/auth';
import { todoRoutes } from './routes/todos';

export function buildApp() {
  const app = Fastify({
    logger: {
      // Nunca deixe o header Authorization aparecer nos logs.
      redact: ['req.headers.authorization'],
    },
  });

  app.register(cors, { origin: true });

  // Rota pra conferir se a API e o banco estão de pé.
  app.get('/health', async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  });

  app.register(authRoutes);
  app.register(todoRoutes);

  // Erros de validação do zod viram 400 com a mensagem; o resto vira 500 genérico.
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: error.issues[0]?.message ?? 'Dados inválidos' });
    }
    // Erros do próprio Fastify (ex: JSON malformado) já vêm com um status 4xx.
    if (error.statusCode && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ error: error.message });
    }
    request.log.error(error);
    return reply.code(500).send({ error: 'Erro interno' });
  });

  return app;
}
