import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { createApp } from '../../src/app.factory';

describe('OpenAPI documentation', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('publishes the document with every circuit route', async () => {
    const response = await request(app.getHttpServer()).get('/docs-json').expect(200);

    expect(response.body.info.title).toBe('SO Turnero API');
    expect(Object.keys(response.body.paths)).toEqual(
      expect.arrayContaining([
        '/applicants',
        '/queue',
        '/journeys/overview',
        '/journeys',
        '/professionals',
        '/journeys/{id}/attentions',
        '/attentions/{id}/finalize',
        '/attentions/{id}/pendings',
        '/pendings/{id}/resolve',
        '/evaluations/{id}/result',
        '/evaluations/{id}/complete',
        '/attentions/{id}/report',
        '/journeys/{id}/reports',
        '/journeys/{id}/closure-readiness',
        '/journeys/{id}/close',
        '/journeys/{id}/certificate',
        '/journeys/{id}/derivations',
        '/journeys/{id}/recitations',
        '/reservations',
        '/health',
      ]),
    );
  });

  it('serves the interactive documentation page', async () => {
    const response = await request(app.getHttpServer()).get('/docs').expect(200);

    expect(response.text).toContain('swagger');
  });
});
