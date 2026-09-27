# List to Do: to-do list com autenticação JWT

Projeto de estudo: cada usuário faz login e vê **só as próprias tarefas**.

```
list-to-do/
├── server/   API: Node + Fastify + Prisma + SQLite
└── mobile/   App: Expo + Expo Router
```

## Primeiro setup

```bash
# API
cd server
npm install
cp .env.example .env
# gere um JWT_SECRET e cole no .env:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
npx prisma migrate dev        # cria o dev.db

# App
cd ../mobile
npm install
cp .env.example .env          # ajuste o EXPO_PUBLIC_API_URL para o IP do seu PC
```

## Rodando

**API** (http://localhost:3333):
```bash
cd server
npm run dev          # sobe a API e reinicia a cada alteração
npm run db:studio    # abre uma interface pra ver o banco no navegador
npm run db:migrate   # rode depois de alterar o prisma/schema.prisma
```

**App:**
```bash
cd mobile
npx expo start       # escaneie o QR code com o Expo Go
```

> No celular, `localhost` é o próprio celular. Para o app acessar a API, use o IP
> do seu PC na rede (ex: `http://192.168.0.10:3333`). Descubra com `ipconfig`.

## Ordem sugerida

Os arquivos com 👇 nos comentários são os que você vai implementar.
O código completo e a explicação de cada passo estão no **[GUIA.md](GUIA.md)**.

1. `server/src/routes/auth.ts`: `/auth/register` e `/auth/login` (teste com curl, Insomnia ou Postman)
2. `server/src/plugins/authenticate.ts`: validar o JWT e preencher `request.user`
3. `server/src/routes/todos.ts`: CRUD sempre filtrando pelo `request.user.id`
4. `server/src/routes/auth.ts`: `/auth/refresh` (com rotação) e `/auth/logout`
5. `mobile/src/auth/AuthContext.tsx`: trocar o mock por chamadas reais, usando `expo-secure-store`
6. `mobile/src/services/todos.ts`: chamar a API enviando `Authorization: Bearer <token>`
7. **Teste final:** crie os usuários A e B, e com o token do B tente ler, editar e apagar uma tarefa do A. Tudo tem que dar 404.
