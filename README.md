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

La capa de identidad (`Usuario`, `Sesion`, `/auth/*`) está implementada y los
comandos clínicos (atenciones, evaluaciones, pendientes, informes) exigen sesión
de profesional: el `professionalId` sale de la sesión, nunca del body. El admin
gestiona cuentas en `/users` (alta de admin o profesional, baja lógica con
revocación de sesiones, reactivación y reset de contraseña) y los turnos
(overview, anulación con actor registrado y borrado restringido). El cierre y la
emisión del certificado quedan reservados al profesional de Clínica Médica.

El postulante se autorregistra con `POST /register` (crea cuenta + recorrido y
abre sesión), consulta su recorrido en `GET /me/journeys` y comparte su
certificado con el link público tokenizado `GET /certificates/public/:token`.

La consola ya tiene login (`#/login`) y vistas por rol: el admin trabaja en
Turnos, Gestión y Usuarios; el profesional en Mi jornada; el postulante en Mi
recorrido. El certificado público se abre en `#/c/<token>` sin sesión. Para
crear la primera cuenta de administración usá `npm run create:admin` (o `POST
/users` una vez logueado).

Cada recorrido guarda `empresa` y `puesto`, y el informe de cada especialidad
combina una conclusión libre con datos estructurados: el esquema de campos lo
define el backend y el read model del recorrido lo expone, así la consola
renderiza el formulario sin duplicar definiciones.

## Scripts

| Comando                       | Descripción                                                                   |
| ----------------------------- | ----------------------------------------------------------------------------- |
| `npm run start:dev`           | API en desarrollo, sirve también `public/` en el mismo origen                  |
| `npm test`                    | Unit + UI + integración + e2e                                                 |
| `npm run build`               | Compila con Nest                                                              |
| `npm run demo:reset`          | Muestra conteos de la demo (dry run)                                          |
| `npm run demo:reset -- --yes` | Borra recorridos y postulantes, libera profesionales y reinicia la numeración |
| `npm run seed:professionals`  | Carga un profesional demo por especialidad                                    |
| `npm run create:admin`        | Crea un usuario Admin: `-- --name "Ada" --email a@b.com --password ...`       |

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
