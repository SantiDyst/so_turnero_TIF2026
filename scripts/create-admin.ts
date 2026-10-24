import 'dotenv/config';

import { RolUsuario } from '@prisma/client';

import { MIN_PASSWORD_LENGTH, hashPassword } from '../src/auth/password';
import { PrismaService } from '../src/prisma/prisma.service';
import { isValidEmail, normalizeEmail } from '../src/shared/email';

function readArg(name: string): string | undefined {
  const args = process.argv.slice(2);
  const index = args.indexOf(`--${name}`);

  if (index === -1) {
    return undefined;
  }

  return args[index + 1];
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main(): Promise<void> {
  const nombre = readArg('name')?.trim() ?? '';
  const email = normalizeEmail(readArg('email') ?? '');
  const password = readArg('password') ?? '';

  if (nombre.length === 0) {
    fail('Missing --name.');
  }
  if (!isValidEmail(email)) {
    fail('Missing or invalid --email.');
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    fail(`--password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  const prisma = new PrismaService().client;

  try {
    const existing = await prisma.usuario.findUnique({ where: { email } });

    if (existing) {
      fail(`A user with email ${email} already exists.`);
    }

    const usuario = await prisma.usuario.create({
      data: {
        nombre,
        email,
        passwordHash: await hashPassword(password),
        rol: RolUsuario.ADMIN,
      },
      select: { id: true, nombre: true, email: true, rol: true },
    });

    console.log(
      `Created ${usuario.rol} ${usuario.nombre} <${usuario.email}> with id ${usuario.id}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
