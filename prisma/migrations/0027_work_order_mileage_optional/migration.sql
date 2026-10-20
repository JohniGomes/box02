-- Migração 0027 — quilometragem de entrada da OS passa a ser opcional
-- Serviços já realizados (lançamento retroativo) muitas vezes não têm o km
-- anotado; obrigar o campo travava o registro. Valores já gravados não mudam.

ALTER TABLE "work_orders" ALTER COLUMN "mileageAtEntry" DROP NOT NULL;
