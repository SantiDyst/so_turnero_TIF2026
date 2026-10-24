import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ROLE_HOME,
  certificateSharePath,
  homePathFor,
  roleLabel,
} from '../../public/js/routes-map.js';

test('maps every role to its landing route', () => {
  assert.equal(ROLE_HOME.ADMIN, '#/gestion');
  assert.equal(ROLE_HOME.PROFESIONAL, '#/evaluar');
  assert.equal(ROLE_HOME.USER, '#/portal');
});

test('falls back to the login route for unknown roles', () => {
  assert.equal(homePathFor('ADMIN'), '#/gestion');
  assert.equal(homePathFor('PROFESIONAL'), '#/evaluar');
  assert.equal(homePathFor('USER'), '#/portal');
  assert.equal(homePathFor(undefined), '#/login');
  assert.equal(homePathFor('ROOT'), '#/login');
});

test('builds the public certificate path from its token', () => {
  assert.equal(certificateSharePath('abc-123'), '#/c/abc-123');
});

test('labels roles for the interface', () => {
  assert.equal(roleLabel('ADMIN'), 'Administración');
  assert.equal(roleLabel('PROFESIONAL'), 'Profesional');
  assert.equal(roleLabel('USER'), 'Postulante');
  assert.equal(roleLabel('OTHER'), 'Sin rol');
});
