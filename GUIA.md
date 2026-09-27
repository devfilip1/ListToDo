# Guia: implementando a autenticação e a autorização

Passo a passo para implementar a autenticação JWT e a autorização da to-do list.
Todo o código abaixo foi testado: o backend passou em 38 testes (incluindo ataques
com token adulterado, `alg: none`, token expirado, reuso de refresh token e acesso a
tarefas de outro usuário) e o cliente do app passou em 20.

**Sumário**

- [Passo 0: o que já foi ajustado](#passo-0-o-que-já-foi-ajustado)
- **Parte 1: Backend**
  - [Passo 1: Funções de token](#passo-1-funções-de-token-arquivo-novo)
  - [Passo 2: Cadastro e login](#passo-2-cadastro-e-login)
  - [Passo 3: O "porteiro", que valida o JWT](#passo-3-o-porteiro-que-valida-o-jwt)
  - [Passo 4: As rotas de tarefas (autorização)](#passo-4-as-rotas-de-tarefas-onde-fica-a-autorização)
  - [Passo 5: Refresh e logout](#passo-5-refresh-e-logout)
- **Parte 2: App**
  - [Passo 6: Endereço da API](#passo-6-endereço-da-api)
  - [Passo 7: Cliente HTTP com refresh automático](#passo-7-cliente-http-com-refresh-automático-arquivo-novo)
  - [Passo 8: Tarefas chamando a API](#passo-8-tarefas-chamando-a-api)
  - [Passo 9: Contexto de autenticação](#passo-9-contexto-de-autenticação)
  - [Passo 10: Teste final](#passo-10-teste-final)

---

## Passo 0: o que já foi ajustado

- **`server/src/app.ts`**: um JSON malformado dava erro 500. Agora dá 400.
- **`server/src/routes/auth.ts`**: um email com espaço no fim era recusado, porque a validação
  rodava antes do `trim`. O `credentialsSchema` foi corrigido.
- **`mobile`**: o `expo-secure-store` já está instalado. Foi preciso usar `--legacy-peer-deps`
  por causa de um conflito de versão que já vinha nos pacotes do Expo Router.

---

# PARTE 1: Backend

## Passo 1: Funções de token (arquivo novo)

Crie `server/src/lib/tokens.ts`. Ele junta tudo que gera ou confere tokens, pra não repetir
código nas rotas.

```ts
import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { prisma } from '../db';
import { env } from '../env';

const secret = new TextEncoder().encode(env.JWT_SECRET);

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

export type TokenUser = { id: string; email: string };

export async function createAccessToken(user: TokenUser) {
  return new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .sign(secret);
}

export async function verifyAccessToken(token: string): Promise<TokenUser> {
  const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });

  if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
    throw new Error('Token sem os dados esperados');
  }

  return { id: payload.sub, email: payload.email };
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function createRefreshToken(userId: string) {
  const token = randomBytes(32).toString('base64url');

  await prisma.refreshToken.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });

  return token;
}

export async function issueTokens(user: TokenUser) {
  return {
    accessToken: await createAccessToken(user),
    refreshToken: await createRefreshToken(user.id),
    user: { id: user.id, email: user.email },
  };
}
```

**O que cada parte faz:**

- **`secret`**: a biblioteca `jose` exige a chave em bytes (`Uint8Array`), não em texto. O
  `TextEncoder` faz essa conversão. Isso roda uma vez, quando o servidor sobe.
- **`createAccessToken`** monta o JWT:
  - `new SignJWT({ email })`: o que vai dentro do token (o *payload*). **Nunca coloque senha ou
    dado sensível aqui.** Qualquer pessoa consegue ler o conteúdo de um JWT; a assinatura só
    impede que ele seja *alterado*.
  - `.setProtectedHeader({ alg: 'HS256' })`: o algoritmo da assinatura, HMAC-SHA256.
  - `.setSubject(user.id)`: grava o id do usuário no campo `sub`, que é o padrão do JWT para
    "de quem é este token".
  - `.setIssuedAt()` e `.setExpirationTime('15m')`: gravam quando o token foi criado e quando
    expira. A verificação recusa sozinha um token vencido.
  - `.sign(secret)`: assina e devolve a string `xxxxx.yyyyy.zzzzz`.
- **`verifyAccessToken`** confere o token:
  - `jwtVerify` checa a assinatura e a validade. Se algo estiver errado, ele **lança um erro**.
  - `{ algorithms: ['HS256'] }` é importante: aceita só esse algoritmo. Sem isso, existem
    ataques que mandam `alg: none` no token pra pular a assinatura.
  - O `if` confere se `sub` e `email` são texto antes de confiar neles.
- **`hashToken`**: gera o SHA-256 do refresh token. O banco guarda só esse hash, então se o
  banco vazar, os tokens vazados não servem pra nada. Aqui SHA-256 é suficiente, diferente das
  senhas: o token é aleatório, com 256 bits, e ninguém consegue adivinhá-lo. Senhas são fracas
  e precisam do argon2, que é lento de propósito.
- **`createRefreshToken`**: `randomBytes(32)` gera 32 bytes aleatórios e seguros. O banco guarda
  o hash, e o token puro vai pro app.
- **`issueTokens`**: gera o par de tokens e escolhe **na mão** os campos do usuário que vão na
  resposta. Nunca devolva o objeto inteiro que vem do Prisma, porque ele tem o `passwordHash`.

---

## Passo 2: Cadastro e login

Em `server/src/routes/auth.ts`, troque o arquivo por este. As rotas de refresh e logout
continuam como estão por enquanto.

```ts
import argon2 from 'argon2';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db';
import { hashToken, issueTokens } from '../lib/tokens';

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Email inválido')),
  password: z.string().min(6, 'A senha precisa ter pelo menos 6 caracteres'),
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
      return reply.code(409).send({ error: 'Este email já está cadastrado' });
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
      return reply.code(401).send({ error: 'Email ou senha inválidos' });
    }

    return issueTokens(user);
  });

  app.post('/auth/refresh', async (request, reply) => {
    return reply.code(501).send({ error: 'TODO: implementar /auth/refresh' });
  });

  app.post('/auth/logout', async (request, reply) => {
    return reply.code(501).send({ error: 'TODO: implementar /auth/logout' });
  });
}
```

**O que cada parte faz:**

- **`credentialsSchema.parse(request.body)`**: valida o corpo do request. Se estiver inválido,
  o zod lança um erro, e o `setErrorHandler` do `app.ts` transforma isso em **400** com a
  mensagem. Por isso não tem nenhum `if` de validação na rota.
- **`.trim().toLowerCase().pipe(z.email())`**: limpa o email *antes* de validar. Assim
  `A@Test.com ` e `a@test.com` são tratados como o mesmo email.
- **Cadastro:**
  - `findUnique` + **409**: responde "Conflito" se o email já existe. Isso revela que o email
    está cadastrado, mas no cadastro não tem como evitar, porque o usuário precisa saber.
  - `argon2.hash(password)`: gera o hash da senha. O argon2 já inclui um *salt* aleatório no
    resultado, então duas senhas iguais geram hashes diferentes.
  - **201** significa "Criado". O cadastro já devolve os tokens, então o usuário entra direto
    no app.
- **Login:**
  - `argon2.verify(hash, senha)`: confere se a senha bate com o hash e devolve `true` ou `false`.
  - **O truque do `dummyHash`**: se o email não existe, a gente *ainda assim* roda o `verify`,
    contra um hash falso. Sem isso, "email não existe" responderia em ~1 ms e "senha errada" em
    ~50 ms, e um atacante descobriria quais emails estão cadastrados só medindo o tempo de
    resposta.
  - A **mesma mensagem** de erro nos dois casos, pelo mesmo motivo.
  - O `return issueTokens(user)` sem `reply.code()` responde **200**.

**Teste no PowerShell** (com o servidor rodando via `npm run dev`):

```powershell
$r = Invoke-RestMethod -Method Post http://localhost:3333/auth/register -ContentType 'application/json' -Body '{"email":"a@test.com","password":"senha123"}'
$r
```

Cole o `accessToken` em https://jwt.io pra ver o que tem dentro dele. Você vai ver o `sub`, o
`email` e o `exp` em texto puro.

---

## Passo 3: O "porteiro", que valida o JWT

Troque o conteúdo de `server/src/plugins/authenticate.ts` por:

```ts
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
    return reply.code(401).send({ error: 'Não autenticado' });
  }

  const token = header.slice('Bearer '.length);

  try {
    request.user = await verifyAccessToken(token);
  } catch {
    return reply.code(401).send({ error: 'Não autenticado' });
  }
}
```

**O que cada parte faz:**

- **`declare module 'fastify'`**: avisa o TypeScript que todo `request` tem um campo `user`. Sem
  isso, `request.user.id` dá erro de tipo nas rotas.
- **`header?.startsWith('Bearer ')`**: o `?.` evita um erro quando o header não existe. O formato
  padrão do header é `Authorization: Bearer <token>`.
- **`header.slice(...)`**: tira o `"Bearer "` e fica só com o token.
- **`try/catch`**: o `verifyAccessToken` lança erro se o token for inválido, adulterado ou estiver
  expirado. Todos esses casos viram **401**, com a mesma mensagem, pra não dar pista a quem está
  atacando.
- **`request.user = ...`**: guarda quem é o usuário. As rotas usam esse valor depois.
- **O `return reply...send()` é o que barra o request.** Se o hook responde, o Fastify **não roda
  a rota**. Se ele termina sem responder, a rota roda normalmente.

---

## Passo 4: As rotas de tarefas, onde fica a AUTORIZAÇÃO

Troque o conteúdo de `server/src/routes/todos.ts` por:

```ts
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
```

**O que cada parte faz:**

- **`app.addHook('preHandler', authenticate)`**: roda o porteiro antes de **todas** as rotas deste
  arquivo. No Fastify, cada `app.register()` cria um "escopo" isolado, então esse hook **não
  afeta** as rotas de `/auth`. Por isso o login continua funcionando sem token.
- **`where: { userId: request.user.id }`**: esta é a autorização. O id vem do **token**, que o
  servidor assinou e o cliente não consegue falsificar. Se alguém mandar um `userId` no body, o
  campo é ignorado, porque o zod só pega o `title`.
- **`select: todoFields`**: devolve só os campos que o app precisa. O `userId` não sai do servidor.
- **`updateMany` / `deleteMany` com `id` + `userId`**: o `update` normal do Prisma só aceita
  filtrar por um campo único (o `id`), e aí qualquer usuário alteraria qualquer tarefa. O
  `updateMany` aceita o filtro combinado, faz tudo **numa consulta só** e devolve `count`, o
  número de linhas afetadas.
- **`count === 0` → 404**: ou a tarefa não existe, ou é de outra pessoa. A resposta é a mesma nos
  dois casos, pra ninguém descobrir que aquele id existe.
- **204** significa "deu certo, sem conteúdo pra devolver".

**Teste de segurança no PowerShell:**

```powershell
$a = Invoke-RestMethod -Method Post http://localhost:3333/auth/login -ContentType 'application/json' -Body '{"email":"a@test.com","password":"senha123"}'
$todo = Invoke-RestMethod -Method Post http://localhost:3333/todos -Headers @{ Authorization = "Bearer $($a.accessToken)" } -ContentType 'application/json' -Body '{"title":"Tarefa do A"}'

$b = Invoke-RestMethod -Method Post http://localhost:3333/auth/register -ContentType 'application/json' -Body '{"email":"b@test.com","password":"senha123"}'
Invoke-RestMethod -Method Delete "http://localhost:3333/todos/$($todo.id)" -Headers @{ Authorization = "Bearer $($b.accessToken)" }
# ↑ tem que dar erro 404
```

---

## Passo 5: Refresh e logout

Em `server/src/routes/auth.ts`, substitua as duas rotas que ainda respondem 501:

```ts
  app.post('/auth/refresh', async (request, reply) => {
    const { refreshToken } = refreshSchema.parse(request.body);

    const stored = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { user: true },
    });

    if (!stored || stored.expiresAt < new Date()) {
      return reply.code(401).send({ error: 'Sessão expirada' });
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
      return reply.code(401).send({ error: 'Sessão expirada' });
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
```

**O que cada parte faz:**

- **`findUnique({ where: { tokenHash: hashToken(...) } })`**: o banco não tem o token puro, então
  a busca é pelo hash. O `include: { user: true }` já traz o usuário junto, na mesma consulta.
- **`expiresAt < new Date()`**: token vencido dá 401 e o usuário precisa fazer login de novo.
- **A rotação**: o `updateMany` com `revokedAt: null` revoga o token **só se ele ainda estiver
  ativo**. Se dois requests chegarem ao mesmo tempo com o mesmo token, só um consegue revogar e o
  outro recebe `count === 0`.
- **Detecção de roubo** (`count === 0`): um refresh token só pode ser usado uma vez. Se alguém usa
  um token já usado, uma de duas pessoas tem uma cópia dele: o dono ou um ladrão. Não dá pra saber
  qual, então **todas** as sessões do usuário são derrubadas e ele precisa entrar de novo.
- **Logout**: revoga o token e responde **204** sempre, mesmo que o token não exista, pra não
  revelar nada.

**Parte 1 pronta!** Rode `npm run db:studio` e veja a tabela `RefreshToken` ganhar linhas com
`revokedAt` preenchido a cada refresh.

---

# PARTE 2: App

## Passo 6: Endereço da API

Crie `mobile/.env`:

```
EXPO_PUBLIC_API_URL=http://192.168.0.10:3333
```

- Troque pelo IP do seu PC, que aparece no `ipconfig` como "Endereço IPv4". No celular,
  `localhost` é o próprio celular, não o seu PC.
- No emulador Android, use `http://10.0.2.2:3333`.
- O prefixo `EXPO_PUBLIC_` é obrigatório pra variável chegar no app. **Nunca coloque segredos
  aqui**: esse valor fica embutido no app, e qualquer pessoa consegue ler.
- Na primeira vez, o Windows pode pedir permissão de firewall pro Node. Libere para **rede
  privada**.
- Depois de criar o `.env`, reinicie o app com `npx expo start -c`.

---

## Passo 7: Cliente HTTP com refresh automático (arquivo novo)

Crie `mobile/src/services/api.ts`:

```ts
import * as SecureStore from 'expo-secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3333';
const REFRESH_TOKEN_KEY = 'refreshToken';

export type User = { id: string; email: string };

type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: User;
};

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// O access token fica só na memória. O refresh token fica no SecureStore.
let accessToken: string | null = null;
let refreshPromise: Promise<User | null> | null = null;
let onSessionExpired: (() => void) | null = null;

export function setOnSessionExpired(callback: () => void) {
  onSessionExpired = callback;
}

async function saveSession(data: AuthResponse) {
  accessToken = data.accessToken;
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, data.refreshToken);
  return data.user;
}

async function clearSession() {
  accessToken = null;
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

async function request<T>(method: string, path: string, body?: unknown, token?: string | null): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) return undefined as T;

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, data?.error ?? 'Erro inesperado');
  }
  return data as T;
}

export async function login(email: string, password: string) {
  return saveSession(await request<AuthResponse>('POST', '/auth/login', { email, password }));
}

export async function register(email: string, password: string) {
  return saveSession(await request<AuthResponse>('POST', '/auth/register', { email, password }));
}

export async function logout() {
  const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  if (refreshToken) {
    await request('POST', '/auth/logout', { refreshToken }).catch(() => {});
  }
  await clearSession();
}

export function refreshSession(): Promise<User | null> {
  refreshPromise ??= (async () => {
    const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    if (!refreshToken) return null;

    try {
      return saveSession(await request<AuthResponse>('POST', '/auth/refresh', { refreshToken }));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await clearSession();
        return null;
      }
      throw error;
    }
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

export async function authRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  try {
    return await request<T>(method, path, body, accessToken);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
  }

  const user = await refreshSession();
  if (!user) {
    onSessionExpired?.();
    throw new ApiError(401, 'Sua sessão expirou, entre novamente');
  }

  return request<T>(method, path, body, accessToken);
}
```

**O que cada parte faz:**

- **`ApiError`**: um erro que carrega o status HTTP, assim o código consegue perguntar "isso foi
  um 401?".
- **`accessToken` numa variável**: fica só na memória e some quando o app fecha. Isso não é
  problema, porque o refresh token gera outro.
- **`SecureStore`**: guarda o refresh token no Keychain (iOS) ou no Keystore (Android), que são
  criptografados pelo sistema. O `AsyncStorage` guarda em texto puro.
- **`request`**: a base de todas as chamadas.
  - O `Content-Type` **só vai quando existe body**. O Fastify recusa um request que diz "tenho
    JSON" e chega vazio, o que quebraria o `DELETE`.
  - **204** não tem corpo, então nem tenta ler JSON.
  - Se o status não for 2xx, lança um `ApiError` com a mensagem que veio do servidor. É por isso
    que "Email ou senha inválidos" aparece direto na tela de login.
- **`login` / `register`**: chamam a API e salvam a sessão. Devolvem o usuário pro contexto.
- **`logout`**: avisa o servidor, mas o `.catch(() => {})` garante que, mesmo sem internet, o
  token é apagado do celular.
- **`refreshSession`**, a parte mais importante:
  - **`refreshPromise ??=`**: se já existe um refresh em andamento, devolve **a mesma Promise** em
    vez de começar outro. Imagine a tela disparando 3 requests com o token vencido: sem isso,
    seriam 3 refreshes com o mesmo token, o servidor acharia que é roubo e derrubaria a sessão (a
    regra do Passo 5).
  - `.finally(() => refreshPromise = null)`: libera o próximo refresh quando o atual termina.
  - **401** significa sessão realmente inválida: limpa tudo e devolve `null`. **Outros erros**,
    como falta de internet, são repassados, pra você não deslogar o usuário por causa de uma rede
    ruim.
- **`authRequest`**, usado em toda rota protegida:
  1. Tenta com o access token atual.
  2. Se der 401, o token provavelmente venceu. Então renova a sessão...
  3. ...e repete o request **uma vez**, com o token novo.
  4. Se o refresh falhar, chama `onSessionExpired`, que faz o app voltar pra tela de login.

---

## Passo 8: Tarefas chamando a API

Troque o conteúdo de `mobile/src/services/todos.ts` por:

```ts
import { authRequest } from './api';

export type Todo = {
  id: string;
  title: string;
  done: boolean;
};

export function listTodos() {
  return authRequest<Todo[]>('GET', '/todos');
}

export function createTodo(title: string) {
  return authRequest<Todo>('POST', '/todos', { title });
}

export function updateTodo(id: string, done: boolean) {
  return authRequest<void>('PATCH', `/todos/${id}`, { done });
}

export function deleteTodo(id: string) {
  return authRequest<void>('DELETE', `/todos/${id}`);
}
```

- Toda a parte difícil (token, refresh, erros) está no `authRequest`, então cada função cabe em
  uma linha.
- O `<Todo[]>` diz ao TypeScript o formato da resposta.
- Repare de novo: **nenhuma função manda `userId`**.
- A tela `(app)/index.tsx` **não muda nada**, porque ela já chamava essas funções.

---

## Passo 9: Contexto de autenticação

Troque o conteúdo de `mobile/src/auth/AuthContext.tsx` por:

```tsx
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import * as api from '../services/api';

export type User = api.User;

type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return value;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    api.setOnSessionExpired(() => setUser(null));

    api
      .refreshSession()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  async function signIn(email: string, password: string) {
    setUser(await api.login(email, password));
  }

  async function signUp(email: string, password: string) {
    setUser(await api.register(email, password));
  }

  async function signOut() {
    await api.logout();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
```

**O que cada parte faz:**

- **`useEffect(..., [])`**: roda uma vez, quando o app abre.
  - `setOnSessionExpired(() => setUser(null))`: conecta o `api.ts` ao React. Quando a sessão
    expira no meio do uso, `user` vira `null` e o `Stack.Protected` do `_layout.tsx` leva o
    usuário pro login sozinho.
  - `refreshSession()`: se existe um refresh token salvo, pega um access token novo e o usuário
    continua logado. Por isso você não precisa logar toda vez que abre o app.
  - `.finally(() => setIsLoading(false))`: enquanto isso não termina, a splash screen fica na
    tela, sem "piscar" a tela de login.
- **`signIn` / `signUp`**: se a API der erro, o `await` repassa o erro, e o `AuthForm` mostra a
  mensagem na tela (esse `try/catch` já estava pronto).
- **`signOut`**: revoga o token no servidor, limpa o celular, e `setUser(null)` volta pro login.

---

## Passo 10: Teste final

1. `cd server` e `npm run dev`
2. `cd mobile` e `npx expo start -c`
3. Cadastre o usuário **A** e crie algumas tarefas. Clique em **Sair**.
4. Cadastre o usuário **B**. A lista tem que aparecer **vazia**.
5. Feche o app por completo e abra de novo. Você tem que continuar logado como B.
6. No `npm run db:studio`, abra a tabela `Todo` e veja que cada tarefa tem o `userId` do seu dono.
