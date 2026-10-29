-- Migração 0040 — fotos das peças trocadas na OS
-- Só acrescenta dois tipos de evidência; nenhuma foto existente muda.
--   PECA_ANTIGA: a peça danificada que foi retirada
--   PECA_NOVA:   a peça nova que foi instalada

ALTER TYPE "WorkOrderEvidenceType" ADD VALUE IF NOT EXISTS 'PECA_ANTIGA';
ALTER TYPE "WorkOrderEvidenceType" ADD VALUE IF NOT EXISTS 'PECA_NOVA';
