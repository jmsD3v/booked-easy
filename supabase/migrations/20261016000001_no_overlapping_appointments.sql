-- Doble reserva por superposición, no solo por hora de inicio igual.
--
-- El índice único (staff_id, appointment_date, start_time) solo frenaba dos
-- turnos que arrancan a la misma hora. Con servicios de distinta duración
-- (ej. uno de 45 min a las 10:00 y otro a las 10:30) dos clientes que
-- reservan al mismo tiempo, o una llamada directa a la API, podían dejar al
-- mismo empleado con dos turnos pisados. La UI ya evita ofrecer esos
-- horarios, pero eso no es un límite real.
--
-- Una restricción de exclusión sobre el rango [inicio, fin) cubre los dos
-- casos (el de inicio igual es una superposición más), así que reemplaza al
-- índice. Rango semiabierto: un turno que empieza justo cuando termina el
-- anterior está permitido. El buffer entre turnos sigue siendo regla de la
-- UI. Los turnos cancelados liberan el horario, igual que antes.
--
-- Error que ve el cliente: SQLSTATE 23P01 (exclusion_violation) en lugar
-- de 23505.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_staff_no_overlap
  EXCLUDE USING gist (
    staff_id WITH =,
    tsrange(appointment_date + start_time, appointment_date + end_time, '[)') WITH &&
  )
  WHERE (staff_id IS NOT NULL AND status <> 'cancelled');

DROP INDEX public.appointments_staff_slot_unique;
