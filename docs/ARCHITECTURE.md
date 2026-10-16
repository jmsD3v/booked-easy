# Arquitectura de TurnoPro

Frontend SPA (React + Vite) que habla directo con Supabase usando la clave pública. No hay backend propio: las reglas que importan viven en la base (RLS, permisos de columna, restricciones, triggers y funciones `SECURITY DEFINER`), y lo que necesita secretos corre en una edge function.

```
Navegador ──(publishable key)──► PostgREST / Auth / Storage ──► Postgres (RLS)
                                         │
                                         └─► Edge function send-whatsapp ──► Meta Cloud API (o simulado)
pg_cron (09:00 UTC) ──► send_appointment_reminders() ──pg_net──┘
```

## ADRs

### ADR-001 — Baseline propia en lugar de la historia de Lovable (2026-10-16)

**Contexto.** El esquema venía de 2 migraciones generadas por Lovable (2026-02-20, con nombres UUID y una policy que se creaba y se borraba en la siguiente) más 11 arreglos propios del 2026-09-13. Nunca se aplicaron a un proyecto Supabase real: el proyecto de Lovable se desvinculó y no se creó otro.

**Decisión.** Consolidar las 13 en `20261016000000_baseline.sql`, con el estado final y comentarios en castellano. Se verificó que el resultado es idéntico: `pg_dump --schema-only` del schema `public`, policies de `storage`, buckets, jobs de `pg_cron`, extensiones y triggers de `auth.users` dan igual antes y después.

**Consecuencias.** Un proyecto nuevo arranca con un esquema legible de una sola pasada. Desde acá, cada cambio es una migración nueva; la baseline no se edita. Si algún día existiera una base con la historia vieja aplicada, habría que marcar la baseline como aplicada con `supabase migration repair` en vez de correrla.

### ADR-002 — Base "lista para activar, no activa" (2026-10-16)

**Contexto.** El producto todavía no tiene clientes; un proyecto en la nube es costo y superficie de ataque sin uso.

**Decisión.** Desarrollo contra el stack local de la CLI de Supabase (`pnpm db:start`). El repo tiene todo para activar un proyecto real con `supabase link` + `db push` + secrets (ver README). No se crea ningún proyecto hasta que se decida.

**Consecuencias.** Seed solo local (crea usuarios directo en `auth.users`, no se corre en producción). Lo que difiere entre local y nube se configura por secrets/Vault, no con cambios de código (ADR-005).

### ADR-003 — Datos personales protegidos por permisos de columna (2026-09-13, documentado 2026-10-16)

**Contexto.** La reserva pública necesita ver qué horarios están ocupados en todos los turnos del negocio, pero RLS filtra filas, no columnas. La policy original de Lovable dejaba a `anon` leer nombre, teléfono y email de todos los clientes.

**Decisión.** Filas de `appointments` visibles para `anon`, pero `GRANT SELECT` solo sobre columnas sin datos personales. Igual en `staff`. El cliente accede a su propio turno con un token UUID a través de funciones `SECURITY DEFINER` que chequean el token.

**Consecuencias.** Una llamada directa a la API no puede devolver datos personales. Toda columna nueva en estas tablas queda oculta para `anon` hasta que se le dé `GRANT` explícito.

### ADR-004 — Doble reserva con restricción de exclusión (2026-10-16)

**Contexto.** El índice único `(staff_id, fecha, hora_inicio)` solo frenaba turnos con la misma hora de inicio. Con servicios de distinta duración, uno de 10:00 a 10:45 y otro a las 10:30 del mismo empleado entraban sin error si se reservaban a la vez o por API.

**Decisión.** `EXCLUDE USING gist (staff_id WITH =, tsrange(inicio, fin, '[)') WITH &&)` sobre turnos no cancelados (extensión `btree_gist`). Reemplaza al índice único. El buffer entre turnos queda como regla de la UI.

**Consecuencias.** El error que ve el frontend es `23P01`; `isSlotTakenError()` lo traduce a "ese horario se acaba de ocupar". Turnos consecutivos (uno termina 10:45, otro empieza 10:45) siguen permitidos.

### ADR-005 — URL de edge functions desde Vault (2026-10-16)

**Contexto.** El cron de recordatorios tenía fija la URL del Kong local (`http://kong:8000`); en un proyecto real no habría enviado nada. Además la función se podía ejecutar por RPC desde `anon`.

**Decisión.** `edge_functions_base_url()` lee el secret `project_url` de Vault y cae al Kong local si no existe; el header `Authorization` usa el secret `anon_key` si existe. `EXECUTE` revocado para `anon` y `authenticated`.

**Consecuencias.** Activar en la nube son dos `vault.create_secret` (README), sin migración nueva.

### ADR-006 — Alta del negocio por trigger (2026-09-13, documentado 2026-10-16)

**Contexto.** Lovable creaba el negocio desde el cliente justo después de `signUp()`. Con confirmación de email no hay sesión en ese momento y RLS rechazaba el insert: quedaban usuarios sin negocio.

**Decisión.** Trigger `AFTER INSERT ON auth.users` (`SECURITY DEFINER`) que crea el negocio con el nombre de `raw_user_meta_data.business_name` y un slug sin acentos.

**Consecuencias.** Un usuario = un negocio. Multi-negocio por cuenta o multi-sede requerirían revisar esto (la tabla `branches` existe pero no tiene pantallas).

### ADR-007 — La reserva pública se valida en la base (2026-10-16)

**Contexto.** Con la clave pública cualquiera podía insertar turnos ya "completados", fuera de horario, de 03:00 a 23:59, con servicios o empleados de otro negocio, y leer todos los turnos de todos los negocios. Además, con sesión abierta la página pública ni cargaba, y las reglas de tiempo corrían en UTC. Modelo de amenazas en `.planning/phases/01-endurecer-reserva/01-PLAN.md`.

**Decisión.**
- Trigger `enforce_public_booking_rules` para clientes (rol `anon` o `authenticated` que no es dueño): estado `pending`, fin = inicio + duración, horarios y bloqueos del negocio y del empleado, buffer, datos del cliente válidos, sin campos internos. El rol sale del JWT o, sin JWT, del `SET ROLE` de la sesión.
- FKs compuestas `(service_id, business_id)` y `(staff_id, business_id)`: un turno solo puede usar servicios y empleados de su negocio, para todos los roles (incluido el dueño).
- `anon` ya no lee `appointments`; la disponibilidad sale de `get_booked_slots()` (solo empleado/inicio/fin, solo dentro de la ventana reservable) y el personal público de `get_public_staff()`.
- Lecturas públicas abiertas también a `authenticated` con las mismas condiciones que `anon`.
- `businesses.timezone` y `appointment_starts_at()` para anticipación, cancelar y reprogramar.
- `send-whatsapp` solo por `manage_token`, sin `verify_jwt` (la clave anon es pública; la credencial real es el token).

**Consecuencias.** La UI puede tener bugs de disponibilidad sin que la base acepte turnos imposibles. Los errores de la base llegan en castellano y la UI los muestra tal cual. El dueño sigue pudiendo cargar turnos a mano fuera de las reglas, pero solo con sus propios servicios y empleados. Queda pendiente rate limiting contra spam de reservas válidas.
