import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Especialidad, Prisma, RecorridoEstado } from '@prisma/client';

import { lockJourney } from '../aptitude/aptitude.service';
import { PrismaService } from '../prisma/prisma.service';
import { isPrismaConflict } from '../shared/prisma-error.mapper';
import { buildCertificateView, certificateIdentifier, CertificateView } from './certificate.view';

export interface IssueCertificateInput {
  professionalId?: string;
}

export interface IssueCertificateResult {
  created: boolean;
  certificate: CertificateView;
}

export interface ProfessionalCandidate {
  id: string;
  nombre: string;
  especialidad: Especialidad;
}

const CLINICAL_SPECIALTY = Especialidad.CLINICA_MEDICA;

const CERTIFICATE_INCLUDE = {
  profesional: { select: { id: true, nombre: true } },
} satisfies Prisma.CertificadoInclude;

export function resolveResponsibleProfessional(
  requestedProfessionalId: string | undefined,
  explicit: ProfessionalCandidate | null,
  latestClinical: ProfessionalCandidate | null,
): ProfessionalCandidate | null {
  if (requestedProfessionalId === undefined) {
    return latestClinical;
  }
  if (!explicit) {
    throw new NotFoundException('Professional not found.');
  }
  if (explicit.especialidad !== CLINICAL_SPECIALTY) {
    throw new BadRequestException('professionalId must reference a CLINICA_MEDICA professional.');
  }

  return explicit;
}

@Injectable()
export class CertificatesService {
  constructor(private readonly prisma: PrismaService) {}

  async read(journeyId: string): Promise<CertificateView> {
    const journey = await this.prisma.client.recorrido.findUnique({
      where: { id: journeyId },
      select: {
        numeroAtencion: true,
        postulante: { select: { id: true, nombre: true, apellido: true } },
        certificado: { include: CERTIFICATE_INCLUDE },
      },
    });

    if (!journey) {
      throw new NotFoundException('Journey not found.');
    }
    if (!journey.certificado) {
      throw new NotFoundException('Certificate not issued.');
    }

    return buildCertificateView({
      certificate: journey.certificado,
      attentionNumber: journey.numeroAtencion,
      applicant: journey.postulante,
    });
  }

  async issue(journeyId: string, input: IssueCertificateInput): Promise<IssueCertificateResult> {
    try {
      return await this.prisma.client.$transaction(async (transaction) => {
        await lockJourney(transaction, journeyId);

        const journey = await transaction.recorrido.findUnique({
          where: { id: journeyId },
          select: {
            numeroAtencion: true,
            estado: true,
            postulante: { select: { id: true, nombre: true, apellido: true } },
            resultadoAptitud: { select: { aptitudFinal: true } },
            certificado: { include: CERTIFICATE_INCLUDE },
          },
        });

        if (!journey) {
          throw new NotFoundException('Journey not found.');
        }

        if (journey.certificado) {
          return {
            created: false,
            certificate: buildCertificateView({
              certificate: journey.certificado,
              attentionNumber: journey.numeroAtencion,
              applicant: journey.postulante,
            }),
          };
        }

        if (journey.estado !== RecorridoEstado.CIERRE_FINAL) {
          throw new ConflictException('Journey is not closed.');
        }
        if (!journey.resultadoAptitud) {
          throw new ConflictException('Journey has no stored final aptitude.');
        }

        const professional = await this.resolveProfessional(
          transaction,
          journeyId,
          input.professionalId,
        );

        const certificate = await transaction.certificado.create({
          data: {
            recorridoId: journeyId,
            identificador: certificateIdentifier(journey.numeroAtencion),
            aptitudFinal: journey.resultadoAptitud.aptitudFinal,
            profesionalId: professional?.id ?? null,
          },
          include: CERTIFICATE_INCLUDE,
        });

        return {
          created: true,
          certificate: buildCertificateView({
            certificate,
            attentionNumber: journey.numeroAtencion,
            applicant: journey.postulante,
          }),
        };
      });
    } catch (error) {
      if (!isPrismaConflict(error)) {
        throw error;
      }

      return { created: false, certificate: await this.read(journeyId) };
    }
  }

  private async resolveProfessional(
    transaction: Prisma.TransactionClient,
    journeyId: string,
    requestedProfessionalId: string | undefined,
  ): Promise<ProfessionalCandidate | null> {
    const explicit = requestedProfessionalId
      ? await transaction.profesional.findUnique({
          where: { id: requestedProfessionalId },
          select: { id: true, nombre: true, especialidad: true },
        })
      : null;

    const clinicalAttention = requestedProfessionalId
      ? null
      : await transaction.atencion.findFirst({
          where: { recorridoId: journeyId, especialidad: CLINICAL_SPECIALTY },
          orderBy: { createdAt: 'desc' },
          select: {
            profesional: { select: { id: true, nombre: true, especialidad: true } },
          },
        });

    return resolveResponsibleProfessional(
      requestedProfessionalId,
      explicit,
      clinicalAttention?.profesional ?? null,
    );
  }
}
