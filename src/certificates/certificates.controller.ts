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
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

import { CertificatesService, IssueCertificateInput } from './certificates.service';

interface IssueCertificateBody {
  professionalId?: unknown;
}

@ApiTags('Certificates')
@Controller()
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  @Post('journeys/:id/certificate')
  @ApiOperation({
    summary: 'Issue the final certificate (idempotent: 201 on first issue, 200 afterwards)',
  })
  @ApiParam({ name: 'id', description: 'Journey id' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        professionalId: {
          type: 'string',
          nullable: true,
          description: 'Optional CLINICA_MEDICA professional id',
        },
      },
    },
  })
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
  @ApiOperation({ summary: 'Read the issued certificate of a journey' })
  @ApiParam({ name: 'id', description: 'Journey id' })
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
