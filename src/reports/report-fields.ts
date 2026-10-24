import { Especialidad } from '@prisma/client';

export type ReportFieldType = 'number' | 'text' | 'textarea' | 'select';

export interface ReportFieldDefinition {
  key: string;
  label: string;
  type: ReportFieldType;
  unit?: string;
  options?: string[];
  help?: string;
  min?: number;
  max?: number;
}

export const REPORT_SCHEMA_VERSION = 1;

const MAX_TEXT_LENGTH = 200;
const MAX_TEXTAREA_LENGTH = 2000;

export const REPORT_FIELDS: Record<Especialidad, ReportFieldDefinition[]> = {
  CLINICA_MEDICA: [
    { key: 'pesoKg', label: 'Peso', type: 'number', unit: 'kg', min: 20, max: 300 },
    { key: 'tallaCm', label: 'Talla', type: 'number', unit: 'cm', min: 90, max: 250 },
    {
      key: 'presionArterial',
      label: 'Presión arterial',
      type: 'text',
      unit: 'mmHg',
      help: 'Se escribe sistólica/diastólica, por ejemplo 120/80.',
    },
    { key: 'frecuenciaCardiaca', label: 'Frecuencia cardíaca', type: 'number', unit: 'lpm' },
    {
      key: 'frecuenciaRespiratoria',
      label: 'Frecuencia respiratoria',
      type: 'number',
      unit: 'rpm',
    },
    { key: 'temperatura', label: 'Temperatura', type: 'number', unit: '°C' },
    { key: 'agudezaVisual', label: 'Agudeza visual', type: 'text' },
    { key: 'agudezaAuditiva', label: 'Agudeza auditiva', type: 'text' },
    { key: 'examenFisico', label: 'Examen físico', type: 'textarea' },
    { key: 'antecedentes', label: 'Antecedentes personales', type: 'textarea' },
  ],
  BIOQUIMICA: [
    {
      key: 'hemoglobina',
      label: 'Hemoglobina',
      type: 'number',
      unit: 'g/dL',
      help: 'Proteína de los glóbulos rojos que transporta oxígeno.',
    },
    {
      key: 'hematocrito',
      label: 'Hematocrito',
      type: 'number',
      unit: '%',
      help: 'Porcentaje del volumen de sangre ocupado por glóbulos rojos.',
    },
    { key: 'glucemia', label: 'Glucemia', type: 'number', unit: 'mg/dL' },
    { key: 'colesterolTotal', label: 'Colesterol total', type: 'number', unit: 'mg/dL' },
    { key: 'trigliceridos', label: 'Triglicéridos', type: 'number', unit: 'mg/dL' },
    { key: 'urea', label: 'Urea', type: 'number', unit: 'mg/dL' },
    { key: 'creatinina', label: 'Creatinina', type: 'number', unit: 'mg/dL' },
    {
      key: 'got',
      label: 'GOT (AST)',
      type: 'number',
      unit: 'U/L',
      help: 'Enzima hepática: transaminasa glutámico oxalacética.',
    },
    {
      key: 'gpt',
      label: 'GPT (ALT)',
      type: 'number',
      unit: 'U/L',
      help: 'Enzima hepática: transaminasa glutámico pirúvica.',
    },
    { key: 'orinaCompleta', label: 'Orina completa', type: 'text' },
    { key: 'otrosEstudios', label: 'Otros estudios', type: 'textarea' },
  ],
  PSICOLOGIA: [
    { key: 'entrevista', label: 'Entrevista', type: 'textarea' },
    {
      key: 'instrumentos',
      label: 'Instrumentos administrados',
      type: 'textarea',
      help: 'Pruebas psicológicas aplicadas, por ejemplo 16PF o Raven.',
    },
    { key: 'hallazgos', label: 'Hallazgos', type: 'textarea' },
    {
      key: 'ansiedad',
      label: 'Indicadores de ansiedad',
      type: 'select',
      options: ['Sin indicadores', 'Leves', 'Moderados', 'Elevados'],
    },
    {
      key: 'depresion',
      label: 'Indicadores de depresión',
      type: 'select',
      options: ['Sin indicadores', 'Leves', 'Moderados', 'Elevados'],
    },
    {
      key: 'riesgoPsicosocial',
      label: 'Riesgo psicosocial',
      type: 'select',
      options: ['Bajo', 'Medio', 'Alto'],
    },
  ],
};

export function reportFieldsFor(specialty: Especialidad): ReportFieldDefinition[] {
  return REPORT_FIELDS[specialty];
}

export interface NormalizedReportData {
  data: Record<string, string | number> | null;
  errors: string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeReportData(specialty: Especialidad, raw: unknown): NormalizedReportData {
  const fields = reportFieldsFor(specialty);

  if (raw === undefined || raw === null) {
    return { data: null, errors: [] };
  }
  if (!isPlainObject(raw)) {
    return { data: null, errors: ['datos must be an object.'] };
  }

  const known = new Set(fields.map((field) => field.key));
  const unknownKeys = Object.keys(raw).filter((key) => !known.has(key));
  const errors: string[] = unknownKeys.map((key) => `Unknown report field: ${key}.`);
  const data: Record<string, string | number> = {};

  for (const field of fields) {
    const value = raw[field.key];

    if (value === undefined || value === null || value === '') {
      continue;
    }

    if (field.type === 'number') {
      const parsed = typeof value === 'number' ? value : Number(value);

      if (!Number.isFinite(parsed)) {
        errors.push(`${field.label} must be a number.`);
        continue;
      }
      if (field.min !== undefined && parsed < field.min) {
        errors.push(`${field.label} must be at least ${field.min}.`);
        continue;
      }
      if (field.max !== undefined && parsed > field.max) {
        errors.push(`${field.label} must be at most ${field.max}.`);
        continue;
      }

      data[field.key] = parsed;
      continue;
    }

    if (typeof value !== 'string') {
      errors.push(`${field.label} must be a string.`);
      continue;
    }

    const text = value.trim();

    if (field.type === 'select') {
      if (!field.options?.includes(text)) {
        errors.push(`${field.label} must be one of: ${(field.options ?? []).join(', ')}.`);
        continue;
      }
      data[field.key] = text;
      continue;
    }

    if (text.length === 0) {
      continue;
    }
    if (text.length > (field.type === 'textarea' ? MAX_TEXTAREA_LENGTH : MAX_TEXT_LENGTH)) {
      errors.push(`${field.label} is too long.`);
      continue;
    }

    data[field.key] = text;
  }

  return {
    data: errors.length === 0 && Object.keys(data).length > 0 ? data : null,
    errors,
  };
}
