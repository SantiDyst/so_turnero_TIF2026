import 'dotenv/config';

import { DisponibilidadProfesional } from '@prisma/client';

import { PrismaService } from '../src/prisma/prisma.service';

const confirmed = process.argv.includes('--yes');

async function main(): Promise<void> {
  const prisma = new PrismaService().client;

  try {
    const counts = {
      reservas: await prisma.reserva.count(),
      recitaciones: await prisma.recitacion.count(),
      derivaciones: await prisma.derivacion.count(),
      informes: await prisma.informe.count(),
      pendientes: await prisma.pendiente.count(),
      atenciones: await prisma.atencion.count(),
      evaluaciones: await prisma.evaluacion.count(),
      resultados: await prisma.resultadoAptitud.count(),
      certificados: await prisma.certificado.count(),
      recorridos: await prisma.recorrido.count(),
      postulantes: await prisma.postulante.count(),
      profesionales: await prisma.profesional.count(),
    };

    console.log('Demo data currently stored:');
    for (const [name, value] of Object.entries(counts)) {
      console.log(`- ${name}: ${value}`);
    }

    if (!confirmed) {
      console.log('\nDry run. Nothing was deleted. Re-run with --yes to reset the demo.');
      return;
    }

    await prisma.$transaction(async (transaction) => {
      await transaction.reserva.deleteMany();
      await transaction.recitacion.deleteMany();
      await transaction.derivacion.deleteMany();
      await transaction.informe.deleteMany();
      await transaction.pendiente.deleteMany();
      await transaction.atencion.deleteMany();
      await transaction.evaluacion.deleteMany();
      await transaction.resultadoAptitud.deleteMany();
      await transaction.certificado.deleteMany();
      await transaction.recorrido.deleteMany();
      await transaction.postulante.deleteMany();
      await transaction.profesional.updateMany({
        data: { disponibilidad: DisponibilidadProfesional.DISPONIBLE },
      });
    });

    await prisma.$executeRawUnsafe('ALTER SEQUENCE recorrido_attention_no_seq RESTART WITH 1');

    console.log('\nDemo reset complete: journeys and applicants removed, professionals released.');
  } finally {
    await prisma.$disconnect();
  }
}

void main();
