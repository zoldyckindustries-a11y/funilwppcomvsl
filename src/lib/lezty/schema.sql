-- Deduplicação dos eventos de webhook da Lezty Pay (Cloudflare D1).
--
-- Aplicar:
--   npx wrangler d1 create funil-lezty
--   npx wrangler d1 execute funil-lezty --remote --file=src/lib/lezty/schema.sql
--
-- E declarar o binding no wrangler.jsonc, com o nome DB:
--   "d1_databases": [
--     { "binding": "DB", "database_name": "funil-lezty", "database_id": "<id>" }
--   ]

CREATE TABLE IF NOT EXISTS lezty_eventos (
  -- id do EVENTO (evt_...), nunca o X-Delivery-Id: esse muda a cada
  -- tentativa, então deduplicar por ele não deduplica nada.
  id            TEXT PRIMARY KEY,
  tipo          TEXT NOT NULL,
  -- recebido | concluido | falhou
  estado        TEXT NOT NULL,
  recebido_em   TEXT NOT NULL,
  concluido_em  TEXT,
  erro          TEXT
);

-- Para varrer o que ficou pelo caminho:
--   SELECT * FROM lezty_eventos WHERE estado <> 'concluido' ORDER BY recebido_em;
CREATE INDEX IF NOT EXISTS idx_lezty_eventos_estado
  ON lezty_eventos (estado, recebido_em);
