import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { Response } from 'express';

import { CertificatesService, IssueCertificateInput } from './certificates.service';

interface IssueCertificateBody {
  professionalId?: unknown;
}

@Controller()
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  @Post('journeys/:id/certificate')
  async issue(
    @Param('id') journeyId: string,
    @Body() body: IssueCertificateBody,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.certificatesService.issue(journeyId, this.validate(body));
    response.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);

    return result.certificate;
  }

  @Get('journeys/:id/certificate')
  read(@Param('id') journeyId: string) {
    return this.certificatesService.read(journeyId);
  }

  private validate(body: IssueCertificateBody): IssueCertificateInput {
    if (body.professionalId === undefined || body.professionalId === null) {
      return {};
    }
    if (typeof body.professionalId !== 'string' || body.professionalId.trim().length === 0) {
      throw new BadRequestException('professionalId must be a non-empty string.');
    }

    return { professionalId: body.professionalId.trim() };
  }
}
