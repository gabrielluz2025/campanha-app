-- Execute este SQL no Supabase → SQL Editor

CREATE TABLE IF NOT EXISTS tse_votos_sc (
  id       BIGSERIAL PRIMARY KEY,
  ano      SMALLINT     NOT NULL,
  cargo    TEXT         NOT NULL,
  numero   INTEGER      NOT NULL,
  municipio TEXT        NOT NULL,
  zona     CHAR(4)      NOT NULL,
  secao    CHAR(4)      NOT NULL,
  votos    INTEGER      NOT NULL DEFAULT 0,
  UNIQUE (ano, cargo, numero, municipio, zona, secao)
);

-- Índice principal para buscas por candidato
CREATE INDEX IF NOT EXISTS idx_tse_cand ON tse_votos_sc (ano, cargo, numero);
CREATE INDEX IF NOT EXISTS idx_tse_mun  ON tse_votos_sc (municipio);

-- RLS: leitura pública (dados são públicos)
ALTER TABLE tse_votos_sc ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leitura_publica" ON tse_votos_sc
  FOR SELECT USING (true);

CREATE POLICY "escrita_service" ON tse_votos_sc
  FOR INSERT WITH CHECK (true);

CREATE POLICY "update_service" ON tse_votos_sc
  FOR UPDATE USING (true);
