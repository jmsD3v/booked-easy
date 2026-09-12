-- Add {link} (the client's self-service manage/cancel page) to the default
-- message templates now that it exists. Only touches the column defaults,
-- not existing businesses' already-customized messages.
ALTER TABLE public.whatsapp_configs
  ALTER COLUMN confirmation_message
  SET DEFAULT 'Hola {nombre}, tu turno en {negocio} está reservado para {fecha} a las {hora}. Para ver o cancelar tu turno: {link}',
  ALTER COLUMN reminder_message
  SET DEFAULT 'Recordatorio: Tu turno en {negocio} es mañana {fecha} a las {hora}. Para cancelar: {link}';
