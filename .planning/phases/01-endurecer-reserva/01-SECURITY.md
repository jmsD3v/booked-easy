---
phase: 1
name: Endurecer la reserva pública
asvs_level: 1
block_on: high
status: SECURED
threats_total: 12
threats_open: 0
audited: 2026-10-16
auditor: gsd-security-auditor (2 pasadas)
---

# Fase 1 — Revisión de seguridad

## Veredicto

**SECURED.** Las 12 amenazas del registro (`01-PLAN.md`) quedaron cerradas y los 3 riesgos aceptados están documentados. La primera pasada encontró una amenaza abierta (T4 entre negocios) y 4 avisos. Se arreglaron con tests primero y la segunda pasada los dio por cerrados.

## Registro de amenazas

| ID | Categoría | Estado | Mitigación | Tests |
| --- | --- | --- | --- | --- |
| T1 | Tampering | CLOSED | El trigger `enforce_public_booking_rules` fuerza `pending`. Reprogramar también deja `pending`. | `public_booking_rules`: T1, T12 |
| T2 | Tampering / DoS | CLOSED | Valida el horario del negocio, el horario del empleado y los bloqueos. | T2a–T2e |
| T3 | DoS | CLOSED | `end_time` = inicio + duración del servicio. Turnos que cruzan medianoche: rechazados. | T1/T3, T8 |
| T4 | Tampering | CLOSED | Para clientes: chequeos en el trigger. Para todos los roles: FKs compuestas `(service_id, business_id)` y `(staff_id, business_id)`, también en `schedule_blocks`. | T4a–T4d y el cruce entre negocios |
| T5 | Tampering | CLOSED + AR-2 | Superposición con buffer en el trigger. La superposición estricta es atómica (ADR-004). | T5a, T5b |
| T6 | Tampering | CLOSED | Rechaza `notes`, `reminder_sent_at` y `branch_id`. Pisa `created_at` y `updated_at`. | T6, W3 |
| T7 | DoS / Tampering | CLOSED | Nombre de 1 a 100 caracteres. Teléfono con regex y al menos 6 dígitos. Email de hasta 254 caracteres con formato válido. | T7a, T7b |
| T8 | Tampering | CLOSED | El mismo trigger corre en `UPDATE OF` fecha, hora, servicio y empleado, dentro de `reschedule_appointment_by_token`. | T8 |
| T9 | Information disclosure | CLOSED | `SELECT` revocado (tabla y columnas). `get_booked_slots` devuelve solo empleado, inicio y fin, y solo dentro de la ventana reservable. | T9, W1 |
| T10 | Spoofing / abuso | CLOSED | `send-whatsapp` solo acepta `manage_token`. El cron también manda el token. | Runtime local: el `appointment_id` devuelve 400 |
| T11 | Lógica | CLOSED | `businesses.timezone` + `appointment_starts_at()` en anticipación, cancelación, reprogramación y en la ventana de W1. | T11 |
| T12 | Funcional / DoS | CLOSED | Policies de lectura e INSERT para `authenticated`. `get_public_staff()` en vez de abrir `staff`. No expone datos personales que `anon` no viera antes. | T12 (6 tests) + navegador |

## Hallazgos de la primera pasada y cómo se cerraron

| # | Hallazgo | Arreglo |
| --- | --- | --- |
| T4 | El dueño de cualquier negocio (el alta es libre) podía cargar un turno de 00:00 a 23:59 con el empleado de otro negocio. Le bloqueaba la agenda a ese negocio sin que lo pudiera ver ni borrar. | FKs compuestas por negocio. |
| W1 | `get_booked_slots` no tenía límite de fechas: daba el historial de turnos de cualquier negocio. | Ventana de hoy a hoy + `max_lead_days`, en la hora del negocio. |
| W2 | Reservar con el teléfono de un tercero le manda un WhatsApp que no pidió. | Documentado en AR-1. |
| W3 | Dentro de `SECURITY DEFINER`, `current_user` siempre es `postgres`. Sin JWT, cualquier sesión quedaba exenta. | El fallback usa el GUC `role`, que sí refleja el `SET ROLE`. |
| W4 | Faltaba ADR-007. | Escrito en `docs/ARCHITECTURE.md`. |

## Riesgos aceptados

| ID | Riesgo | Por qué se acepta | Qué lo cerraría |
| --- | --- | --- | --- |
| AR-1 | Spam de reservas válidas (muchos turnos `pending`), incluso con teléfonos de terceros: les llegan confirmaciones y recordatorios por WhatsApp sin haberlos pedido, con costo de Meta cuando haya credenciales reales. | Hace falta un borde con rate limiting o captcha, y hoy no hay producción. | Rate limiting en una edge function o en un WAF, o verificación del teléfono. Antes de activar WhatsApp real. |
| AR-2 | Carrera del buffer: dos reservas simultáneas pueden quedar pegadas sin buffer, pero nunca superpuestas. | Bajo impacto. Lo atómico es la superposición. | Incluir el buffer en la restricción de exclusión. |
| AR-3 | `manage_token` es la única credencial del link "mis turnos". | Mismo modelo que un link de reseteo de clave (ADR-003). UUID de 122 bits. | Vencimiento del token u OTP por WhatsApp. |

## Informativo

- `verify_jwt = false` en `send-whatsapp`: la clave anon es pública, así que el JWT no protegía nada. La credencial es el token, más la idempotencia por turno y tipo de mensaje.
- `caller` confía primero en el claim del JWT y después en el rol real de la base. Por PostgREST los dos siempre coinciden y un cliente no puede setear `request.jwt.claims`.
