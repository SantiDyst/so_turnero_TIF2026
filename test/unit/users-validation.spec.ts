import { BadRequestException } from '@nestjs/common';
import { Especialidad, RolUsuario } from '@prisma/client';

import { UsersController } from '../../src/users/users.controller';
import { UsersService } from '../../src/users/users.service';

function makeController() {
  const service = {
    list: jest.fn(),
    create: jest.fn(),
    deactivate: jest.fn(),
    activate: jest.fn(),
    changePassword: jest.fn(),
  };

  return { service, controller: new UsersController(service as unknown as UsersService) };
}

const valid = {
  nombre: 'Ada Lovelace',
  email: 'ada@example.com',
  password: 'a-long-password',
  rol: RolUsuario.ADMIN,
};

describe('user creation validation', () => {
  it('reports every missing field', () => {
    const { controller } = makeController();
    let captured: BadRequestException | undefined;

    try {
      controller.create({});
    } catch (error) {
      captured = error as BadRequestException;
    }

    expect(captured).toBeInstanceOf(BadRequestException);
    expect(captured?.getResponse()).toEqual({
      message: 'Validation failed.',
      missingFields: ['nombre', 'email', 'password', 'rol'],
    });
  });

  it('rejects invalid emails and short passwords', () => {
    const { controller } = makeController();

    expect(() => controller.create({ ...valid, email: 'not-an-email' })).toThrow(
      BadRequestException,
    );
    expect(() => controller.create({ ...valid, password: 'short' })).toThrow(BadRequestException);
  });

  it('only allows ADMIN or PROFESIONAL roles', () => {
    const { controller } = makeController();

    expect(() => controller.create({ ...valid, rol: RolUsuario.USER })).toThrow(
      'rol must be ADMIN or PROFESIONAL.',
    );
    expect(() => controller.create({ ...valid, rol: 'ROOT' })).toThrow(
      'rol must be ADMIN or PROFESIONAL.',
    );
  });

  it('rejects a professional link on an admin account', () => {
    const { controller } = makeController();

    expect(() => controller.create({ ...valid, specialty: Especialidad.PSICOLOGIA })).toThrow(
      'An admin user cannot have a professional link.',
    );
  });

  it('requires exactly one professional link strategy', () => {
    const { controller } = makeController();

    expect(() => controller.create({ ...valid, rol: RolUsuario.PROFESIONAL })).toThrow(
      'A professional user needs specialty or professionalId.',
    );
    expect(() =>
      controller.create({
        ...valid,
        rol: RolUsuario.PROFESIONAL,
        specialty: Especialidad.CLINICA_MEDICA,
        professionalId: 'professional-1',
      }),
    ).toThrow('Provide either specialty or professionalId, not both.');
  });

  it('rejects an unsupported specialty', () => {
    const { controller } = makeController();

    expect(() =>
      controller.create({ ...valid, rol: RolUsuario.PROFESIONAL, specialty: 'Clinical' }),
    ).toThrow('specialty must be BIOQUIMICA, CLINICA_MEDICA, or PSICOLOGIA.');
  });

  it('normalizes the email and forwards valid admin and professional payloads', () => {
    const { service, controller } = makeController();

    controller.create({ ...valid, email: '  ADA@Example.com ' });
    expect(service.create).toHaveBeenCalledWith({
      nombre: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'a-long-password',
      rol: RolUsuario.ADMIN,
    });

    controller.create({
      ...valid,
      rol: RolUsuario.PROFESIONAL,
      specialty: Especialidad.PSICOLOGIA,
    });
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({
        rol: RolUsuario.PROFESIONAL,
        specialty: Especialidad.PSICOLOGIA,
      }),
    );

    controller.create({
      ...valid,
      rol: RolUsuario.PROFESIONAL,
      professionalId: '  professional-1  ',
    });
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({
        rol: RolUsuario.PROFESIONAL,
        professionalId: 'professional-1',
      }),
    );
  });
});

describe('password reset validation', () => {
  it('rejects a short password before touching the service', () => {
    const { service, controller } = makeController();

    expect(() => controller.changePassword('user-1', { password: 'short' })).toThrow(
      BadRequestException,
    );
    expect(service.changePassword).not.toHaveBeenCalled();
  });

  it('forwards a valid password', () => {
    const { service, controller } = makeController();

    controller.changePassword('user-1', { password: 'a-long-password' });

    expect(service.changePassword).toHaveBeenCalledWith('user-1', 'a-long-password');
  });
});
