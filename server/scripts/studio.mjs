// Abre o Prisma Studio apontando para o dev.db.
//
// Por que este script existe: o Prisma Studio 7 só reconhece URLs no formato
// "protocolo://", então o "file:./dev.db" do .env dá erro de "protocol not supported".
// Aqui montamos a URL com o caminho absoluto: file://C:/.../dev.db (Windows)
// ou file:///home/.../dev.db (Linux/macOS).
import { spawn } from 'node:child_process';
import { resolve, sep } from 'node:path';

const dbPath = resolve(import.meta.dirname, '..', 'dev.db').split(sep).join('/');
const url = `file://${dbPath}`;

spawn(`npx prisma studio --url "${url}" ${process.argv.slice(2).join(' ')}`, {
  stdio: 'inherit',
  shell: true,
}).on('exit', (code) => process.exit(code ?? 0));
