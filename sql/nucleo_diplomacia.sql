-- ============================================================
-- FASE 14 — Diplomacia entre Núcleos (nucleo_diplomacia)
-- Relações núcleo↔núcleo (Aliados/Inimigos/Neutros), escopo crônica.
-- Rodar manualmente pelo DBA (a aplicação só tem permissões DML — Regra 4.1).
-- PK uuid com gen_random_uuid() (Regra 4.3). FKs em CASCADE p/ não deixar lixo.
-- ============================================================

CREATE TABLE IF NOT EXISTS nucleo_diplomacia (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cronica_id  uuid NOT NULL REFERENCES cronicas(id)         ON DELETE CASCADE,
    nucleo_a_id uuid NOT NULL REFERENCES entidade_nucleos(id) ON DELETE CASCADE,
    nucleo_b_id uuid NOT NULL REFERENCES entidade_nucleos(id) ON DELETE CASCADE,
    status      varchar(16) NOT NULL CHECK (status IN ('aliado', 'inimigo', 'neutro')),
    criado_em   timestamptz NOT NULL DEFAULT now()
);

-- Leitura sempre filtra por crônica (anti-IDOR + performance).
CREATE INDEX IF NOT EXISTS idx_nucleo_diplomacia_cronica ON nucleo_diplomacia (cronica_id);

-- Conceder DML ao usuário da aplicação (ajuste o nome se necessário).
GRANT SELECT, INSERT, UPDATE, DELETE ON nucleo_diplomacia TO app_mochila;
