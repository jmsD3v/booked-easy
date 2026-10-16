# Estado — TurnoPro

**Última actualización:** 2026-10-16

## Dónde estamos

Fase 1 (endurecer la reserva pública) cerrada y con revisión de seguridad aprobada (`phases/01-endurecer-reserva/01-SECURITY.md`, 12/12 amenazas cerradas). La app corre completa contra el stack local de Supabase; no hay proyecto en la nube (a propósito).

- Migraciones: `20261016000000_baseline` … `20261016000003_harden_public_booking`.
- Verde: `pnpm lint`, `pnpm typecheck`, `pnpm test` (8), `pnpm db:test` (3 archivos, 54 pgTAP), `pnpm build`.
- Revisado en navegador: reserva con sesión abierta de otro negocio a 360 px, error de la base visible, reprogramar anónimo en escritorio, panel del dueño.
- Edge function `send-whatsapp` y cron de recordatorios probados en runtime local.

## Próximo

Fase 2 — página pública que vende (theming + SEO por negocio). Tiene pantallas grandes: correr `/gsd-ui-phase` antes y `/gsd-ui-review` después. El SEO por negocio pide una decisión de arquitectura (prerender/SSR vs meta dinámicas) que va como ADR.

## Decisiones tomadas (Juanma, 2026-10-16)

- Orden de fases 2 a 8 como está en `ROADMAP.md`.
- Seña: primero sin pasarela.
- Marca: TurnoPro por ahora.

## Cómo retomar

```sh
pnpm install && pnpm db:start && pnpm db:reset && pnpm dev
```
Cuentas demo (`demo@` y `otro@turnopro.local`) y receta de activación en `README.md` / `supabase/seed.sql`.
