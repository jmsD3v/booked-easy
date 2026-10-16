# Fase 1 — Endurecer la reserva pública en la base

**Aprobada:** 2026-10-16 (Juanma). **Tipo:** seguridad (permisos + datos personales) → modelo de amenazas acá y revisión de seguridad al cierre (`01-SECURITY.md`).

## Objetivo

Que la base sea el límite real de la reserva pública: nada de lo que la UI no permitiría hacer se pueda hacer pegándole directo a la API con la clave pública.

## Superficie

| Punto de entrada | Quién | Hoy |
| --- | --- | --- |
| `INSERT appointments` (PostgREST) | `anon` | Solo exige nombre y teléfono no vacíos. |
| `SELECT appointments` (columnas sin datos personales) | `anon` | Todas las filas de todos los negocios. |
| `rpc/reschedule_appointment_by_token` | `anon` con token | Mueve el turno a cualquier fecha/hora; `p_new_end` lo elige el cliente. |
| `rpc/cancel_appointment_by_token` | `anon` con token | OK, pero "ya pasó" se calcula en UTC. |
| Edge function `send-whatsapp` | cualquiera | Acepta `appointment_id` o `manage_token`. |

## Modelo de amenazas (STRIDE)

| # | Amenaza | Categoría | Impacto | Mitigación en esta fase |
| --- | --- | --- | --- | --- |
| T1 | `anon` inserta un turno con `status` `confirmed`/`completed`/`no_show` | Tampering | Agenda y estadísticas falsas, ingresos inflados | Trigger fuerza `status = 'pending'` para no-dueños |
| T2 | Turno fuera del horario del negocio, del horario del empleado, en día bloqueado o con negocio cerrado | Tampering / DoS | Bloquea agenda, turnos imposibles | Trigger valida horario del negocio, horario y bloqueos del empleado, bloqueos del negocio |
| T3 | `end_time` arbitrario (ej. 03:00–23:59) que ocupa al empleado todo el día | DoS | Nadie más puede reservar con ese empleado | `end_time` se recalcula en la base: inicio + duración del servicio |
| T4 | Servicio inactivo o de otro negocio; empleado inactivo o de otro negocio | Tampering | Datos inconsistentes, precios de otro negocio | Trigger valida pertenencia y que estén activos |
| T5 | Ignorar el buffer entre turnos | Tampering | Turnos pegados que el negocio no quiere | Trigger chequea superposición con buffer (best effort; la superposición sin buffer ya es atómica por ADR-004) |
| T6 | Campos que el cliente no debería tocar: `notes`, `reminder_sent_at`, `branch_id`, `created_at` | Tampering | Notas falsas visibles al dueño; recordatorio suprimido | Trigger los pisa para no-dueños |
| T7 | Payload gigante en nombre/teléfono/email | DoS / Tampering | Base inflada, plantillas de WhatsApp rotas | Largos máximos y formato de teléfono |
| T8 | Reprogramar por token a un horario inválido o con `p_new_end` arbitrario | Tampering | Igual que T2/T3 | El mismo trigger corre en el UPDATE de fecha/hora/servicio/empleado |
| T9 | Enumerar todos los turnos de todos los negocios (ids, fechas, servicios) | Information disclosure | Volumen de negocio de la competencia; ids usables en T10 | Se revoca `SELECT` de `appointments` a `anon`; disponibilidad por RPC `get_booked_slots(negocio, fecha)` que devuelve solo empleado + inicio + fin |
| T10 | Disparar WhatsApp a clientes ajenos llamando `send-whatsapp` con `appointment_id` enumerado | Spoofing / abuso | Mensajes no pedidos a teléfonos reales, costo Meta | La función solo acepta `manage_token`; el cron también pasa el token |
| T11 | Reglas de tiempo en UTC (servidor) en vez de hora argentina | Tampering (lógico) | Anticipación mínima corrida 3 h; "ya pasó" mal calculado | `businesses.timezone` (default `America/Argentina/Buenos_Aires`) usado en anticipación, cancelar y reprogramar |
| T12 | Un usuario logueado (otro dueño) no puede reservar en otro negocio y ve horarios ocupados como libres | Funcional / DoS | Reserva rota si el cliente tiene sesión abierta | Policy de INSERT pública para `anon` y `authenticated`; disponibilidad por RPC para ambos |

### Riesgos aceptados (fuera de esta fase)

- **Spam de reservas** con datos inventados dentro de las reglas (muchos turnos `pending`). Incluye reservar con el teléfono de un tercero: le llega la confirmación y el recordatorio por WhatsApp sin haberlo pedido (con costo de Meta cuando el negocio tenga credenciales reales). Requiere rate limiting / captcha en un borde (edge function o WAF). Queda en deuda técnica.
- **Carrera en el buffer (T5)**: dos reservas simultáneas pueden quedar pegadas sin buffer, nunca superpuestas.
- **Token del cliente** como única credencial del link "mis turnos": mismo modelo que un reseteo de clave (ADR-003).

## Exenciones

Las reglas aplican cuando el rol del request (`auth.role()`; sin JWT, el `SET ROLE` de la sesión; sin ninguno, el usuario conectado) es `anon` o `authenticated` y el usuario **no** es dueño del negocio. Quedan exentos el dueño (carga a mano / walk-ins), `service_role` (edge functions) y SQL directo como `postgres` (seed, mantenimiento).

## Tareas

1. Tests pgTAP en `supabase/tests/public_booking_rules.test.sql` para T1–T12, vistos fallar.
2. Migración `20261016000003_harden_public_booking.sql`: `timezone`, trigger `validate_public_booking`, RPC `get_booked_slots`, cambios de policies/grants, funciones de token con zona horaria, cron con token.
3. Frontend: `PublicBooking` y `ManageAppointment` usan `get_booked_slots`; mensajes de error de la base visibles.
4. Edge function: solo `manage_token`.
5. ADR-007 en `docs/ARCHITECTURE.md`; `01-SECURITY.md` con verificación de cada amenaza.
6. Verificación: lint, typecheck, tests, `db:test`, build, navegador a 360 px y escritorio (reserva anónima, reserva con sesión abierta, reprogramar).
