# Espacio La Lupa — Sitio público + Gestión interna

Aplicación única que sirve:

- **`/`** — el sitio público original (https://espacio.lalupa.com.ar/), un
  `index.html` autoextraíble que se conserva **byte-idéntico** en
  `public/index.html` (verificado por test E2E).
- **`/gestion`** — el sistema privado de gestión del estudio: alumnas, packs,
  saldos, asistencia, pagos, alertas y auditoría. Con `noindex` y
  encabezados de seguridad; nunca aparece en buscadores.

## Arquitectura

| Capa | Tecnología |
|---|---|
| Framework | Next.js 15 (App Router) + TypeScript, una sola app full-stack |
| Base de datos | PostgreSQL + Prisma (migraciones versionadas en `prisma/migrations`) |
| Autenticación | Propia: bcryptjs + sesiones en DB (cookie httpOnly, SameSite=Lax) |
| UI | Tailwind CSS v4, mobile-first, paleta de la identidad de La Lupa |
| Validación | zod en cada server action + reglas re-verificadas en servicios |
| Tests | Vitest (unit + integración con Postgres embebido) y Playwright (E2E) |

### Estructura

```
public/index.html        ← sitio público ORIGINAL (no tocar)
prisma/                  ← schema, migraciones y seed
src/
  middleware.ts          ← redirección de conveniencia para /gestion
  app/gestion/           ← pantallas (login + panel)
  server/
    auth/                ← password, sesiones, rate limit, requireUser
    services/            ← TODA la lógica de negocio (transacciones)
    actions/             ← server actions delgadas: zod → requireUser → servicio
  lib/                   ← lógica pura testeable (policy, fechas, errores)
tests/unit|integration|e2e
```

## Modelo de datos (resumen)

- `User` (roles `ADMIN` / `TEACHER`), `Session`, `LoginAttempt`
- `Student` (+ soft delete), `StudentAlert` (datos sensibles mínimos,
  visibilidad `TODOS` / `SOLO_ADMIN`)
- `Activity`, `PackProduct` (catálogo), `StudentPack` (compra concreta)
- `Attendance` — único por `(alumna, actividad, fecha)` → **imposible
  descontar dos veces la misma clase**
- `LedgerMovement` — libro de movimientos **inmutable** (solo INSERT):
  `PACK_PURCHASE, CLASS_USED, BONUS, CORRECTION_POS, CORRECTION_NEG,
  EXPIRATION, CANCELLATION, REVERSAL`. **El saldo siempre se deriva de la
  suma de movimientos**, nunca de un contador editable. La inmutabilidad
  está protegida **físicamente en PostgreSQL** (migración
  `20260725180000_ledger_immutability`): un trigger rechaza todo `UPDATE`
  o `DELETE` sobre la tabla, incluso por SQL directo con la conexión de la
  aplicación. Las correcciones son siempre movimientos compensatorios
  nuevos. (Un administrador total de PostgreSQL siempre puede alterar la
  infraestructura deliberadamente; eso se mitiga con permisos y backups.)
- `Payment` (anulación soft, nunca se borra), `AuditEvent`, `Settings`
  (reglas de consumo configurables).

## Reglas de negocio

1. Asistencia + débito + auditoría se guardan en **una única transacción**.
2. Reglas de consumo (configurables en `/gestion/configuracion`):
   presente ✔ consume, cancelación anticipada ✘, cancelación tardía ✔,
   ausencia ✔, clase de prueba ✘.
3. El pack a debitar se elige por vencimiento más próximo (FIFO).
4. Correcciones y reversiones crean **movimientos compensatorios**; el
   historial jamás se edita ni se borra.
5. Saldo negativo solo mediante acción administrativa explícita (queda auditado).
6. Packs vencidos se marcan automáticamente al cargar el dashboard
   (`expirePacks`, idempotente) debitando el saldo restante como `EXPIRATION`.
7. Autorización **server-side** en cada página y server action
   (`requireUser`); las profesoras no ven pagos, usuarias, auditoría ni
   alertas `SOLO_ADMIN`.
8. La auditoría nunca guarda contraseñas, tokens ni contenido de alertas
   (solo el tipo).

## Desarrollo local

Requisitos: Node 20+ y npm. No hace falta Docker ni instalar PostgreSQL.

```bash
npm install
node scripts/dev-db.mjs        # PostgreSQL embebido en :5433 (dejar corriendo)
# .env ya apunta a postgresql://postgres:postgres@localhost:5433/lalupa
npx prisma migrate dev         # aplica migraciones
npm run db:seed                # datos ficticios de desarrollo
npm run dev                    # http://localhost:3000
```

Credenciales del seed (**EXCLUSIVAS de desarrollo local**; el seed
productivo las rechaza explícitamente):
`admin@lalupa.local` / `lupa-admin-dev` y `profe@lalupa.local` / `lupa-profe-dev`.

## Primer usuario administrador (producción)

Con `NODE_ENV=production` el seed **solo** ejecuta el bootstrap de la
primera administradora (`prisma/seed-admin.ts`); jamás carga datos
ficticios ni usa credenciales de desarrollo. Reglas:

- Sin `SEED_ADMIN_EMAIL` ni `SEED_ADMIN_PASSWORD`: no crea nada y termina
  bien ("seed administrativo omitido").
- Con **una sola** de las dos variables: aborta con error, sin crear nada.
- Con ambas: exige email válido y contraseña de **al menos 12 caracteres**;
  rechaza `lupa-admin-dev` y demás credenciales de desarrollo. La
  contraseña nunca se imprime y solo se guarda su hash bcrypt.
- Si ya existe **cualquier** usuario, nunca crea otra administradora:
  con el mismo email termina sin cambios (idempotente, no toca contraseña
  ni rol); con otro email aborta con error. Las cuentas adicionales se
  crean desde `/gestion/usuarios`.
- **Ejecuciones simultáneas** (varios procesos o réplicas, p. ej. en
  Railway): el contar-y-crear corre dentro de una única transacción
  serializada con un advisory lock transaccional de PostgreSQL
  (`pg_advisory_xact_lock(20260725, 1)`, clave fija documentada en
  `prisma/seed-admin.ts`). A lo sumo un proceso crea la administradora;
  el resto espera el lock, relee el estado ya committeado y aplica las
  reglas anteriores (idempotencia o rechazo). El lock se libera solo al
  terminar la transacción (commit, rollback o corte de conexión) y no
  bloquea ninguna otra operación del sistema. Límite: la exclusión vale
  dentro del **mismo** PostgreSQL (es el caso de la app); no cubre
  bases de datos distintas.

```bash
SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... npx prisma db seed
```

Ejecutarlo una única vez (por ejemplo con `railway run`) y luego **eliminar
ambas variables** (el sistema no las necesita más). Desde
`/gestion/usuarios` esa administradora crea al resto del equipo.

## Migraciones

- Nueva migración: `npx prisma migrate dev --name descripcion`
- Aplicar en producción: `npx prisma migrate deploy` (lo hace el start de
  Railway automáticamente; es idempotente y no destructivo).

## Tests

```bash
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
npm run test        # unitarios (sin DB)
npm run test:int    # integración (scripts/test-int.mjs): genera Prisma
                    #   Client ANTES de cargar los tests, levanta Postgres
                    #   embebido efímero en :5434, aplica las migraciones
                    #   sobre una base limpia y devuelve exit code distinto
                    #   de cero ante CUALQUIER fallo (generate, setup,
                    #   carga de tests, tests o teardown) — apto para CI
npm run test:e2e    # Playwright (requiere dev-db en :5433 con seed aplicado)
```

## Despliegue en Railway (manual — NO automatizado)

La app está **preparada** pero el despliegue es una decisión manual:

1. **No tocar el servicio actual** que sirve el sitio con `serve` hasta
   validar el nuevo.
2. Crear un servicio nuevo desde este repo/rama + un plugin **PostgreSQL**.
3. Variables del servicio (solo nombres; los valores nunca se commitean):
   - `DATABASE_URL` (la inyecta el plugin de PostgreSQL)
   - `TZ` = `America/Argentina/Buenos_Aires`
   - `APP_URL` (dominio final)
   - `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` (solo para el primer seed; borrar después)
4. `railway.json` ya define build (`npm run build`), start
   (`prisma migrate deploy && next start`), health check (`/api/health`) y
   reinicio ante fallos. Railway inyecta `PORT` automáticamente.
5. Probar el dominio provisorio de Railway: `/` debe mostrar el sitio
   público idéntico y `/gestion` el login.
6. Recién entonces apuntar el dominio `espacio.lalupa.com.ar` al servicio
   nuevo y apagar el viejo.

> ⚠️ **Autodeploy**: si se conecta el repo a GitHub, Railway puede desplegar
> automáticamente cada push a la rama configurada. Antes de pushear,
> revisar en el proyecto Railway qué rama dispara deploys. Este repo se
> entregó **sin remoto configurado**, por lo que ningún push es posible por
> accidente.

### Rollback

- **Código**: Railway conserva los deploys anteriores — "Redeploy" del
  deploy previo. El sitio estático original además queda intacto en la rama
  `main` (commit `4d66dfb`).
- **Base de datos**: la migración inicial solo crea tablas nuevas, no toca
  nada existente. Para revertir por completo basta eliminar el plugin
  PostgreSQL del servicio nuevo.

### Backup

Railway PostgreSQL permite backups desde el panel. Alternativa manual:
`railway run pg_dump $DATABASE_URL > backup.sql` (programar al menos
semanal). Los movimientos del libro son inmutables, lo que hace los
backups incrementales especialmente confiables.

## Limitaciones del MVP y próximos pasos

- Sin pasarela de pagos (los pagos se registran manualmente).
- Sin recuperación de contraseña autoservicio (la resetea una administradora
  desde `/gestion/usuarios`).
- "Alumnas previstas" por clase se infiere de asistencias; no hay inscripción
  fija alumna→horario (próximo paso natural).
- `expirePacks` corre al abrir el dashboard; con más volumen conviene un cron.
- Las reglas de cancelación son globales (no por actividad).
- Roles preparados para crecer (enum `Role`), pero solo hay dos implementados.
