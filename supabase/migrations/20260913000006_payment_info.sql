-- Instead of integrating a payment gateway (Mercado Pago etc.) — most
-- small businesses here just get paid by bank transfer, and the client
-- needs the alias/CVU (and often a QR) at hand right after booking. No
-- money moves through TurnoPro; this is just showing static payment info
-- at the right moment so neither side has to ask for it over WhatsApp.
ALTER TABLE public.businesses
  ADD COLUMN payment_alias TEXT,
  ADD COLUMN payment_note TEXT,
  ADD COLUMN payment_qr_url TEXT;
