# TurnoPro

Sistema de reservas y turnos online multi-sede: agenda, personal, horarios de atención y confirmaciones por WhatsApp.

## Qué hace (el más completo de la tanda)

- **Multi-negocio** — `businesses`, uno por dueño.
- **Servicios y personal** — `services`, `staff`, `staff_schedules`.
- **Horarios de atención** — `business_hours` por sucursal.
- **Turnos** — `appointments`, con página pública de reserva (`PublicBooking.tsx`) que inserta directo contra Supabase — no es una maqueta.
- **WhatsApp** — `whatsapp_configs` + página de configuración (`WhatsAppPage.tsx`) que guarda y actualiza contra la tabla real.
- **Dashboard** — agenda, estadísticas, ajustes, todo detrás de auth.
- **Tests** — Vitest ya configurado (`npm test`), aunque hoy solo hay un test de ejemplo (`src/test/example.test.ts`), no cobertura real todavía.

## Stack

React 18 + TypeScript + Vite, shadcn/ui sobre Radix, Tailwind, React Router, React Query, React Hook Form + Zod, Supabase (Postgres + Auth), Vitest + Testing Library.

## Seguridad — arreglado 2026-09-13

Auditoría encontró y corrigió dos problemas reales (ver `supabase/migrations/20260913000001_fix_signup_and_public_leaks.sql`), verificados contra un Postgres descartable antes de mergear:

- **El alta de negocio se creaba desde el cliente**, justo después de `signUp()`. Con confirmación de email activada (default de Supabase) no hay sesión activa en ese momento, así que la policy `owner_id = auth.uid()` rechazaba el insert y el usuario quedaba creado sin negocio. Ahora el negocio se crea con un trigger en `auth.users` (`SECURITY DEFINER`), que no depende de la sesión del que llama.
- **`appointments` exponía datos de clientes a cualquiera sin login.** La policy de SELECT para `anon` decía "own appointments" pero el `USING` era `true` — cualquiera con la clave anon (siempre pública) podía leer nombre/teléfono/email de todos los turnos de todos los negocios pegándole directo a la API. Se resolvió con grants a nivel de columna: `anon` ahora solo puede leer las columnas necesarias para chequear disponibilidad de horarios (fechas, horas, estado), nunca los datos del cliente. Mismo fix en `staff` (email/teléfono del personal no debían ser públicos).

## Pendiente (funcional, no seguridad)

- `branches` existe en el esquema pero no tiene ninguna pantalla — ni en el dashboard ni en la reserva pública. Hoy es una tabla muerta, no una feature de multi-sede real.
- La reserva pública nunca asigna `staff_id` — con 2+ empleados el sistema bloquea horarios como ocupados aunque haya otro empleado libre.
- Sin protección contra doble reserva simultánea (falta un constraint o chequeo transaccional).
- El envío de WhatsApp no está implementado — se guardan credenciales y mensajes, pero no hay ninguna llamada a la Meta Cloud API todavía.
- `client_email` existe en la tabla pero el formulario público nunca lo pide.
- `logo_url` existe en `businesses` pero no hay forma de subirlo desde Configuración.

## Estado actual

El flujo de negocio (reservar → guardar turno → configurar WhatsApp) está implementado de punta a punta contra Supabase, no simulado. **No hay un proyecto Supabase provisionado** — el código ya está listo para conectar (variables de entorno, esquema completo en `supabase/migrations/`), pero deliberadamente no se crea la instancia hasta que el proyecto la necesite de verdad.

## Desarrollo local

```sh
npm install
cp .env.example .env   # completar con las credenciales de un proyecto Supabase nuevo
supabase link --project-ref <tu-project-id>
supabase db push        # aplica supabase/migrations/
npm run dev
npm test                # Vitest
```
