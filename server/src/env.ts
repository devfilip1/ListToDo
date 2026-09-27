import { z } from 'zod';

// Valida as variáveis de ambiente na inicialização: se faltar algo, o servidor nem sobe.
const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET precisa ter pelo menos 32 caracteres'),
  PORT: z.coerce.number().default(3333),
});

export const env = envSchema.parse(process.env);
