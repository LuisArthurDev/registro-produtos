-- Catálogo produtos_ean migrado do SQLite validado (82.972 registros)
CREATE TABLE IF NOT EXISTS produtos (
  ean TEXT PRIMARY KEY NOT NULL,
  codigo_interno TEXT NOT NULL DEFAULT '',
  descricao TEXT NOT NULL DEFAULT '',
  secao TEXT NOT NULL DEFAULT ''
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_produtos_codigo_interno ON produtos(codigo_interno);
