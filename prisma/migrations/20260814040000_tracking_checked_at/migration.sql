-- Quando il controllo delle altre fonti di eventi ha dato una risposta.
--
-- Serve perche' quella risposta arrivava da una richiesta fatta dal browser, e
-- il browser riparte da zero a ogni apertura: la configurazione risultava
-- incompleta per i primi secondi, e i passi tornavano a comparire sopra una
-- dashboard gia' pronta.
--
-- Additiva: colonna nuova, nullable, nessun dato toccato.

ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "tracking_checked_at" TIMESTAMP(3);
