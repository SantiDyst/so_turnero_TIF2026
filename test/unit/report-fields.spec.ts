import { Especialidad } from '@prisma/client';

import {
  REPORT_SCHEMA_VERSION,
  normalizeReportData,
  reportFieldsFor,
} from '../../src/reports/report-fields';

const SPECIALTIES = [Especialidad.BIOQUIMICA, Especialidad.CLINICA_MEDICA, Especialidad.PSICOLOGIA];

describe('report field schemas', () => {
  it('defines at least one well-formed field per specialty', () => {
    for (const specialty of SPECIALTIES) {
      const fields = reportFieldsFor(specialty);

      expect(fields.length).toBeGreaterThan(0);

      for (const field of fields) {
        expect(field.key).toMatch(/^[a-z][A-Za-z0-9]*$/);
        expect(field.label.length).toBeGreaterThan(0);
        expect(['number', 'text', 'textarea', 'select']).toContain(field.type);
        if (field.type === 'select') {
          expect(field.options?.length ?? 0).toBeGreaterThan(0);
        }
      }
    }

    expect(REPORT_SCHEMA_VERSION).toBe(1);
  });
});

describe('report data normalization', () => {
  it('trims text and parses numbers', () => {
    const { data, errors } = normalizeReportData(Especialidad.CLINICA_MEDICA, {
      pesoKg: '72.5',
      tallaCm: 175,
      presionArterial: ' 120/80 ',
    });

    expect(errors).toEqual([]);
    expect(data).toEqual({ pesoKg: 72.5, tallaCm: 175, presionArterial: '120/80' });
  });

  it('drops empty values and returns null when nothing is left', () => {
    expect(
      normalizeReportData(Especialidad.CLINICA_MEDICA, { pesoKg: '', presionArterial: '   ' }),
    ).toEqual({ data: null, errors: [] });
    expect(normalizeReportData(Especialidad.CLINICA_MEDICA, undefined)).toEqual({
      data: null,
      errors: [],
    });
  });

  it('rejects non-numeric, out-of-range, unknown and invalid option values', () => {
    expect(normalizeReportData(Especialidad.CLINICA_MEDICA, { pesoKg: 'abc' }).errors).toEqual([
      'Peso must be a number.',
    ]);
    expect(normalizeReportData(Especialidad.CLINICA_MEDICA, { pesoKg: 5 }).errors).toEqual([
      'Peso must be at least 20.',
    ]);
    expect(normalizeReportData(Especialidad.CLINICA_MEDICA, { nope: 1 }).errors).toEqual([
      'Unknown report field: nope.',
    ]);
    expect(normalizeReportData(Especialidad.PSICOLOGIA, { ansiedad: 'Mucha' }).errors).toEqual([
      'Indicadores de ansiedad must be one of: Sin indicadores, Leves, Moderados, Elevados.',
    ]);
    expect(normalizeReportData(Especialidad.CLINICA_MEDICA, 'text').errors).toEqual([
      'datos must be an object.',
    ]);
  });

  it('accepts valid select options', () => {
    expect(
      normalizeReportData(Especialidad.PSICOLOGIA, {
        ansiedad: 'Leves',
        riesgoPsicosocial: 'Bajo',
      }).data,
    ).toEqual({ ansiedad: 'Leves', riesgoPsicosocial: 'Bajo' });
  });
});
