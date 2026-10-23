# SO Turnero

Prototipo académico (MVP) del Sistema de Salud Ocupacional (SO): gestión de un
turnero de postulantes que recorren evaluaciones de Bioquímica, Clínica Médica y
Psicología hasta obtener una aptitud final y un certificado demostrativo.

> Solo datos ficticios. Sin integración con sistemas institucionales, sin firma
> digital ni mensajería automática.

## Stack

- **Backend:** NestJS + TypeScript.
- **Persistencia:** PostgreSQL administrado (Neon), acceso vía Prisma ORM.
- **Despliegue:** Vercel (API serverless + consola estática).

## Estado

Circuito RF-01..RF-16 implementado y desplegado. Incluye una consola de
verificación provisoria (HTML + ES modules, sin build) para probar el recorrido
completo de un postulante desde el navegador.

- API: https://so-turnero.vercel.app
- Documentación interactiva: https://so-turnero.vercel.app/docs
- Consola: https://so-turnero.vercel.app

La consola es pública, sin autenticación ni roles: es una herramienta de
verificación, no un producto final. La UI definitiva se planificará aparte.

## Scripts

| Comando                       | Descripción                                                                   |
| ----------------------------- | ----------------------------------------------------------------------------- |
| `npm run start:dev`           | API en desarrollo, sirve también `public/` en el mismo origen                 |
| `npm test`                    | Unit + UI + integración + e2e                                                 |
| `npm run build`               | Compila con Nest                                                              |
| `npm run demo:reset`          | Muestra conteos de la demo (dry run)                                          |
| `npm run demo:reset -- --yes` | Borra recorridos y postulantes, libera profesionales y reinicia la numeración |
| `npm run seed:professionals`  | Carga un profesional demo por especialidad                                    |

Las migraciones se aplican automáticamente en el build de producción de Vercel
(`npm run vercel-build`).

## Estructura

- `src/` — API NestJS por módulo (applicants, journeys, attentions, evaluations, reports, certificates, aptitude, agenda, derivations).
- `public/` — consola de verificación servida en el mismo origen.
- `docs/` — requisitos fuente y walkthrough funcional.
- `openspec/` — artefactos del ciclo SDD (proposals, specs, design, tasks).

## Fuentes

La carpeta `docs/requisitos/` contiene los documentos de los que derivan todas las
specs: requisitos y especificaciones (RF-01..RF-16, RNF-01..04), casos de uso
(CU01..CU04), historias de usuario (HU-*) y el mapa conceptual del MVP.
