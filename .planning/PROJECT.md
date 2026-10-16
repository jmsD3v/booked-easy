# TurnoPro

## Qué es

SaaS de turnos online para negocios de servicios en Argentina (barberías, peluquerías, estética, consultorios). El negocio comparte un link (`/b/<slug>`), el cliente reserva solo y le llega la confirmación y el recordatorio por WhatsApp. Producto pensado para vender a negocios chicos.

Origen: scaffold de Lovable (2026-02). Desacoplado de Lovable y de su proyecto Supabase en 2026-09; esquema propio desde 2026-10-16 (ADR-001).

## Para quién

- **Dueño del negocio**: carga servicios, personal, horarios; ve agenda y números. Poco tiempo, usa el celular.
- **Cliente final**: reserva en 1 minuto desde el celular, sin crear cuenta.

## Stack

React 18 + TS + Vite 8, shadcn/ui, Tailwind, TanStack Query, Supabase (Postgres, Auth, Storage, Edge Functions, pg_cron). Vitest + pgTAP. pnpm.

## Constraints (no se negocian)

1. **Sin base en vivo ni planes pagos por defecto.** Todo corre contra el stack local de la CLI; la activación en la nube queda documentada y la decide Juanma.
2. **Datos personales de clientes nunca expuestos a `anon`**: permisos de columna + funciones por token (ADR-003). Toda columna nueva en `appointments`/`staff` se revisa contra esto.
3. **Reglas de plata y de datos en la base, no solo en la UI**, y con test pgTAP escrito y visto fallar antes del código.
4. **Mobile-first**: sin scroll horizontal a 360 px; montos que no se parten (`formatPrice`).
5. **Modo oscuro gris oscuro, nunca negro** (cuando se active).
6. **Migraciones solo hacia adelante**: la baseline y las migraciones commiteadas no se editan.
7. **pnpm**, rama `main`, últimas versiones estables.
8. Copy en castellano rioplatense con voseo.
9. Nada que borre datos o publique sin confirmación de Juanma.
10. Fases que tocan cuentas, permisos, datos personales o plata: modelo de amenazas en el plan y `/gsd-secure-phase` al cerrar.

## Decisiones

En `docs/ARCHITECTURE.md` (ADR-001 a ADR-006).
