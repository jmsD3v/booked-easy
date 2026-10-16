# Fase 1 — Resumen de ejecución

**Fecha:** 2026-10-16

## Qué se hizo

- Migración `supabase/migrations/20261016000003_harden_public_booking.sql`:
  - `businesses.timezone` (default `America/Argentina/Buenos_Aires`, validada) y `appointment_starts_at()`; anticipación, cancelar y reprogramar usan hora del negocio.
  - Trigger `enforce_public_booking_rules` (BEFORE INSERT y UPDATE de fecha/hora/servicio/empleado) para clientes no dueños: estado forzado a `pending`, rechaza `notes`/`reminder_sent_at`/`branch_id`, valida nombre/teléfono/email, servicio y empleado del negocio y activos, fin = inicio + duración, horario del negocio y del empleado, bloqueos, buffer.
  - Policy de INSERT pública para `anon` y `authenticated`; lecturas públicas (negocio, servicios, horarios, horarios del personal, bloqueos) abiertas también a `authenticated`.
  - `get_booked_slots()` y `get_public_staff()` (SECURITY DEFINER, columnas sin datos personales). `SELECT` de `appointments` revocado a `anon` (tabla y columnas).
  - Cron de recordatorios pasa `manage_token`.
- Edge function `send-whatsapp`: solo acepta `manage_token` y `message_type` válido.
- `supabase/config.toml`: `verify_jwt = false` para `send-whatsapp` (el cron local daba 401; la clave anon es pública, la credencial real es el token).
- Frontend: `PublicBooking` y `ManageAppointment` usan los RPC.
- Seed: segundo negocio `luna` (otro@turnopro.local) y sin turnos de sábado a la tarde.

## Verificación

- `pnpm db:test`: 3 archivos pgTAP en verde (31 tests de esta fase, vistos fallar antes de la migración).
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`: verdes.
- Edge function en runtime local: token → OK; `appointment_id` → 400; tipo inválido → 400. Cron: 4 recordatorios simulados, `reminder_sent_at` marcado.
- Navegador: reserva con sesión abierta de otro negocio a 360 px (antes no cargaba), teléfono inválido muestra el error de la base, reprogramar anónimo en escritorio (fin recalculado), panel del dueño confirma un turno.

## Threat Flags

- Nuevo: `verify_jwt = false` en `send-whatsapp` amplía quién puede llamarla (ya era alcanzable con la clave anon pública). Mitigado por token + idempotencia por tipo de mensaje.
- Riesgos aceptados: spam de reservas válidas (sin rate limiting), carrera del buffer, token como única credencial del link del cliente.
