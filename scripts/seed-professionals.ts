import 'dotenv/config';

import { Especialidad } from '@prisma/client';

import { PrismaService } from '../src/prisma/prisma.service';

const demoProfessionals: { nombre: string; especialidad: Especialidad }[] = [
  { nombre: 'Dra. Bioquimica Demo', especialidad: Especialidad.BIOQUIMICA },
  { nombre: 'Dr. Clinica Medica Demo', especialidad: Especialidad.CLINICA_MEDICA },
  { nombre: 'Lic. Psicologia Demo', especialidad: Especialidad.PSICOLOGIA },
];

async function seed(): Promise<void> {
  const prisma = new PrismaService().client;

  try {
    for (const professional of demoProfessionals) {
      const existing = await prisma.profesional.findFirst({ where: professional });

      if (existing) {
        console.log(`Skipped ${existing.nombre} (${existing.especialidad}): already exists.`);
        continue;
      }

      const created = await prisma.profesional.create({ data: professional });
      console.log(`Created ${created.nombre} (${created.especialidad}) with id ${created.id}.`);
    }

    const professionals = await prisma.profesional.findMany({
      orderBy: [{ especialidad: 'asc' }, { nombre: 'asc' }],
    });

    console.log('\nProfessionals in DATABASE_URL:');

    for (const professional of professionals) {
      console.log(
        `- ${professional.nombre} | ${professional.especialidad} | ${professional.disponibilidad}`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

void seed();
