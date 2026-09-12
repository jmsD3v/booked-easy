-- Prevent double-booking at the database level, not just in the UI.
--
-- All appointments are created through PublicBooking.tsx, which only ever
-- offers slots aligned to a 30-minute grid (see generateTimeSlots), so two
-- appointments for the same staff member can only collide by having the
-- exact same start_time on the same date — a plain partial unique index is
-- enough here, no need for a range-overlap exclusion constraint. Two clients
-- hitting "Confirmar turno" for the same slot within the same few seconds
-- will now have the second insert rejected with a unique-violation instead
-- of silently succeeding.
--
-- Only enforced when staff_id is set and the appointment isn't cancelled,
-- since a cancelled slot should free up the time again.
CREATE UNIQUE INDEX appointments_staff_slot_unique
  ON public.appointments (staff_id, appointment_date, start_time)
  WHERE staff_id IS NOT NULL AND status != 'cancelled';
