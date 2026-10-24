import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export const SWAGGER_PATH = 'docs';

export function setupSwagger(app: INestApplication): void {
  const description = [
    'API-first backend for the occupational-health appointment MVP.',
    'Journey, attention and report states are Spanish strings; specialty, evaluation state and result are enum codes.',
    'Errors use { statusCode, message, error }, except POST /applicants, POST /register and POST /users which return { message, missingFields }.',
  ].join(' ');

  const config = new DocumentBuilder()
    .setTitle('SO Turnero API')
    .setDescription(description)
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(SWAGGER_PATH, app, document);
}
