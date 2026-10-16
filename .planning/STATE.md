# Estado — TurnoPro

**Última actualización:** 2026-10-16

## Dónde estamos

Fase 0 (limpieza post-Lovable) cerrada. La app corre completa contra el stack local de Supabase; no hay proyecto en la nube (a propósito).

- Migraciones: `20261016000000_baseline` + `…01_no_overlapping_appointments` + `…02_reminders_ready_for_hosted`.
- Verde: `pnpm lint`, `pnpm typecheck`, `pnpm test` (8), `pnpm db:test` (17 pgTAP), `pnpm build`.
- Revisado en navegador a 360 px y escritorio: reserva pública (incluida la carrera de doble reserva), reprogramar, panel completo.

## Próximo

Esperando que Juanma apruebe prioridades del `ROADMAP.md`. Propuesta: Fase 1 (endurecer la reserva pública en la base) antes que cualquier feature nueva.

## Decisiones abiertas

- Nombre de marca: TurnoPro vs TurnAR.
- Orden de las fases 2 a 8.
- Seña: ¿arrancar sin pasarela (confirmación manual) o directo con Mercado Pago?

## Cómo retomar

```sh
pnpm install && pnpm db:start && pnpm db:reset && pnpm dev
```
Cuenta demo y receta de activación en `README.md`.
