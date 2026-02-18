-- ============================================================
-- Migration 011 — Identidade Progressiva de Contatos
-- Adiciona colunas para suportar hierarquia de nomes e
-- proteção contra sobrescrita por sincronizações futuras.
-- ============================================================

-- 1. push_name: nome bruto vindo do WhatsApp (pushName da Evolution API)
--    Armazenado para consulta sem alterar o nome exibido.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS push_name TEXT DEFAULT NULL;

-- 2. name_manual: nome editado manualmente pelo atendente via CRM.
--    Quando preenchido, o motor de sync NÃO sobrescreve o campo 'name'.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS name_manual TEXT DEFAULT NULL;

-- 3. Índice para acelerar buscas por name_manual (usado na hierarquia)
CREATE INDEX IF NOT EXISTS idx_clients_name_manual
  ON clients (tenant_id, name_manual)
  WHERE name_manual IS NOT NULL;

-- 4. Comentários para documentação no banco
COMMENT ON COLUMN clients.push_name IS
  'Nome bruto recebido do WhatsApp (pushName da Evolution API). Nunca exibido diretamente — serve como fonte secundária na hierarquia de identidade.';

COMMENT ON COLUMN clients.name_manual IS
  'Nome definido manualmente pelo atendente via CRM. Quando preenchido, o motor de sync não sobrescreve o campo name. Hierarquia: name_manual > pedido > push_name > telefone.';
