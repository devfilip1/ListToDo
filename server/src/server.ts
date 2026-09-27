import { buildApp } from './app';
import { env } from './env';

const app = buildApp();

// host 0.0.0.0 para o celular (Expo Go) conseguir acessar pela rede local.
app.listen({ port: env.PORT, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
