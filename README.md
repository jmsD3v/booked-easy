# BookedEasy

Sistema de reservas y turnos online multi-sede: agenda, personal, horarios de atención y confirmaciones por WhatsApp.

## Qué hace (el más completo de la tanda)

- **Multi-negocio / multi-sede** — `businesses` + `branches`.
- **Servicios y personal** — `services`, `staff`, `staff_schedules`.
- **Horarios de atención** — `business_hours` por sucursal.
- **Turnos** — `appointments`, con página pública de reserva (`PublicBooking.tsx`, 346 líneas) que inserta directo contra Supabase — no es una maqueta.
- **WhatsApp** — `whatsapp_configs` + página de configuración (`WhatsAppPage.tsx`) que guarda y actualiza contra la tabla real.
- **Dashboard** — agenda, estadísticas, ajustes, todo detrás de auth.
- **Tests** — Vitest ya configurado (`npm test`), aunque hoy solo hay un test de ejemplo (`src/test/example.test.ts`), no cobertura real todavía.

## Stack

React 18 + TypeScript + Vite, shadcn/ui sobre Radix, Tailwind, React Router, React Query, React Hook Form + Zod, Supabase (Postgres + Auth), Vitest + Testing Library.

## Estado actual

El flujo de negocio (reservar → guardar turno → configurar WhatsApp) está implementado de punta a punta contra Supabase, no simulado. **La instancia de Supabase original no está conectada** — para levantarlo hay que crear un proyecto nuevo, correr las migraciones de `supabase/migrations/` y completar `.env` a partir de `.env.example`. Lo que sí falta: cobertura de tests real y, si se retoma como producto, definir el flujo de recordatorios de WhatsApp (la tabla de config existe, el envío automático no está armado todavía).

## Desarrollo local

```sh
npm install
cp .env.example .env   # completar con las credenciales del proyecto Supabase
npm run dev
npm test                # Vitest
```
