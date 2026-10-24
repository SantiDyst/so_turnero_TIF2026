import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { createApp } from '../../src/app.factory';

const MODULES = [
  '/js/main.js',
  '/js/api-client.js',
  '/js/router.js',
  '/js/routes-map.js',
  '/js/dom.js',
  '/js/state-map.js',
  '/js/views/login.js',
  '/js/views/register.js',
  '/js/views/portal.js',
  '/js/views/users.js',
  '/js/views/public-certificate.js',
  '/js/views/journey.js',
  '/js/views/closure.js',
  '/js/views/reports.js',
  '/js/views/evaluate-list.js',
  '/js/views/intake.js',
  '/js/views/management.js',
];

describe('console shell', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the shell with the dynamic navigation slot', async () => {
    const response = await request(app.getHttpServer()).get('/').expect(200);

    expect(response.text).toContain('id="topnav"');
    expect(response.text).toContain('/js/main.js');
  });

  it('serves every view module referenced by the router', async () => {
    for (const path of MODULES) {
      const response = await request(app.getHttpServer()).get(path).expect(200);

      expect(response.text.length).toBeGreaterThan(0);
    }
  });
});
