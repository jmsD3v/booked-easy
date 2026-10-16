# Roadmap — TurnoPro

## Hecho

**Tier 1 — que funcione de verdad (2026-09-12)**
- Desacople de Lovable y de su proyecto Supabase; stack local con la CLI; pnpm.
- Alta de negocio por trigger; fuga de datos personales de clientes y staff cerrada.

**Tier 2 — lo que un negocio pide primero (2026-09-12)**
- Elección de profesional y disponibilidad por empleado; doble reserva frenada en la base.
- Logo del negocio; datos de cobro (alias/QR) al terminar la reserva.
- WhatsApp: confirmación + recordatorio diario (modo simulado sin credenciales de Meta).
- Cliente cancela y reprograma con link, sin cuenta.
- Buffer entre turnos, anticipación mínima/máxima, días bloqueados.

**Fase 0 — limpieza post-Lovable (2026-10-16)**
- Baseline propia de migraciones (ADR-001), tipos regenerados, lint/typecheck en verde.
- Turnos superpuestos frenados en la base (ADR-004); cron de recordatorios listo para nube y cerrado a `anon` (ADR-005).
- 17 tests pgTAP; seed con turnos de demo; README con receta de activación.

## Pendiente — propuesta de prioridad (esperando OK de Juanma)

### Fase 1 — Endurecer la reserva pública en la base  ·  seguridad
Hoy `anon` puede insertar un turno con cualquier `status` (ej. `completed`), fuera del horario del negocio, con `end_time` arbitrario, o con un servicio/empleado de otro negocio; reprogramar por token tampoco valida horario. La UI no lo hace, pero la API sí lo permite.
- Trigger de validación: servicio y empleado del mismo negocio, `end_time = inicio + duración`, dentro de horario del negocio y del empleado, día no bloqueado, `status` forzado a `pending` para `anon`.
- Lo mismo para `reschedule_appointment_by_token`.
- Modelo de amenazas + `/gsd-secure-phase`.

### Fase 2 — Página pública que vende (theming + SEO por negocio)
- Color de marca y portada por negocio; modo oscuro gris (hoy hay tokens `.dark` casi negros y sin selector).
- SEO: `<title>`, descripción y Open Graph por negocio, datos estructurados `LocalBusiness`, sitemap de páginas públicas. Requiere prerender/SSR o meta dinámicas (decisión de arquitectura).

### Fase 3 — Seña para reservar  ·  plata
- Variante sin pasarela primero (alinea con el alias actual): turno queda `pending` hasta que el negocio marca la seña como recibida; vencimiento automático.
- Con pasarela (Mercado Pago) después, solo si Juanma lo decide: requiere cuenta y comisiones.

### Fase 4 — Reportes y comisiones por empleado  ·  plata
- Ingresos por empleado y por servicio, por rango de fechas; export CSV.
- % de comisión por empleado y liquidación del período.

### Fase 5 — Suscripción de los negocios  ·  plata, cuentas
- Planes y límites (empleados, turnos/mes), prueba gratis, bloqueo suave al vencer. Cobro con Mercado Pago suscripciones — se deja todo listo, sin activar.

### Fase 6 — Super-admin  ·  permisos
- Panel interno: negocios, estado de suscripción, métricas, soporte (impersonar con registro).

### Fase 7 — Reseñas
- Reseña post-turno vía link del WhatsApp (1 por turno completado), moderación del dueño, promedio en la página pública.

### Fase 8 — Directorio público
- Búsqueda de negocios por rubro y zona. Tiene sentido con masa crítica de negocios; va último.

### Deuda técnica chica (sin fase)
- `access_token` de WhatsApp en texto plano en la tabla (el dueño lo lee de vuelta): moverlo a Vault.
- `schedule_blocks.reason` visible para `anon`.
- `branches` sin pantallas (multi-sede no construido): decidir si se construye o se borra.
- `tsconfig` con `strict: false`; casi sin tests de UI.
- Bundle de 500+ kB: code-splitting del panel.
- Restos del template: `src/App.css`, `public/placeholder.svg`, componentes shadcn sin uso.
- Nombre de marca: ¿TurnoPro o TurnAR? (pendiente de Juanma).
