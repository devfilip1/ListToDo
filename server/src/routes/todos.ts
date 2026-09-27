import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db';
import { authenticate } from '../plugins/authenticate';

const createTodoSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

const updateTodoSchema = z.object({
  done: z.boolean(),
});

const paramsSchema = z.object({
  id: z.string(),
});

// Campos devolvidos ao app (o userId não precisa sair do servidor).
const todoFields = { id: true, title: true, done: true } as const;

export async function todoRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/todos', async (request) => {
    return prisma.todo.findMany({
      where: { userId: request.user.id },
      orderBy: { createdAt: 'desc' },
      select: todoFields,
    });
  });

  app.post('/todos', async (request, reply) => {
    const { title } = createTodoSchema.parse(request.body);

    const todo = await prisma.todo.create({
      data: { title, userId: request.user.id },
      select: todoFields,
    });

    return reply.code(201).send(todo);
  });

  app.patch('/todos/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const { done } = updateTodoSchema.parse(request.body);

    const { count } = await prisma.todo.updateMany({
      where: { id, userId: request.user.id },
      data: { done },
    });

    if (count === 0) {
      return reply.code(404).send({ error: 'Tarefa não encontrada' });
    }
    return reply.code(204).send();
  });

  app.delete('/todos/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);

    const { count } = await prisma.todo.deleteMany({
      where: { id, userId: request.user.id },
    });

    if (count === 0) {
      return reply.code(404).send({ error: 'Tarefa não encontrada' });
    }
    return reply.code(204).send();
  });
}