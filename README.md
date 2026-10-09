# SO Turnero

Prototipo académico (MVP) del Sistema de Salud Ocupacional (SO) — gestión de un
turnero de postulantes que recorren evaluaciones de Bioquímica, Clínica Médica y
Psicología hasta obtener una aptitud final y un certificado demostrativo.

> Solo datos ficticios. Sin integración con sistemas institucionales, sin firma
> digital ni mensajería automática.

## Stack

- **Backend:** NestJS + TypeScript (API-first; la UI queda para una etapa posterior).
- **Persistencia:** PostgreSQL administrado, acceso vía Prisma ORM.
- **Despliegue:** Vercel (backend). Proveedor de PostgreSQL pendiente de selección.

## Estado

En fase de **planificación**, dirigida por specs (Spec-Driven Development / OpenSpec).
No hay código de aplicación todavía.

## Estructura

- `docs/requisitos/` — documentos fuente (requisitos, casos de uso, historias, mapa conceptual).
- `openspec/` — artefactos del ciclo SDD (proposals, specs, design, tasks).

## Fuentes

La carpeta `docs/requisitos/` contiene los documentos de los que derivan todas las
specs: requisitos y especificaciones (RF-01..RF-16, RNF-01..04), casos de uso
(CU01..CU04), historias de usuario (HU-*) y el mapa conceptual del MVP.
