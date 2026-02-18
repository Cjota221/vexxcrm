-- ============================================================
-- Migration 010: Limpeza de dados duplicados
-- ============================================================
-- Remove clientes, conversas e mensagens duplicadas.
-- Consolida tudo por phone_normalized (telefone canônico).
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- PASSO 1: Identificar o cliente "mestre" de cada telefone
-- (o mais antigo com mais pedidos/dados)
-- ════════════════════════════════════════════════════════════

-- Criar tabela temporária com o mapeamento de duplicatas
CREATE TEMP TABLE client_dedup_map AS
SELECT 
  id as duplicate_id,
  FIRST_VALUE(id) OVER (
    PARTITION BY tenant_id, phone_normalized 
    ORDER BY 
      total_orders DESC NULLS LAST,
      ltv DESC NULLS LAST,
      created_at ASC,
      id ASC
  ) as master_id
FROM clients
WHERE phone_normalized IS NOT NULL AND phone_normalized != '';

-- ════════════════════════════════════════════════════════════
-- PASSO 2: Migrar mensagens para o cliente mestre
-- ════════════════════════════════════════════════════════════

UPDATE messages m
SET client_id = dm.master_id
FROM client_dedup_map dm
WHERE m.client_id = dm.duplicate_id
  AND dm.duplicate_id != dm.master_id;

-- ════════════════════════════════════════════════════════════
-- PASSO 3: Migrar pedidos para o cliente mestre
-- ════════════════════════════════════════════════════════════

UPDATE orders o
SET client_id = dm.master_id
FROM client_dedup_map dm
WHERE o.client_id = dm.duplicate_id
  AND dm.duplicate_id != dm.master_id;

-- ════════════════════════════════════════════════════════════
-- PASSO 4: Consolidar conversas
-- ════════════════════════════════════════════════════════════

-- Migrar conversas para o cliente mestre
UPDATE conversations c
SET client_id = dm.master_id
FROM client_dedup_map dm
WHERE c.client_id = dm.duplicate_id
  AND dm.duplicate_id != dm.master_id;

-- Identificar conversa mestre por cliente (a mais antiga)
CREATE TEMP TABLE conv_dedup_map AS
SELECT 
  id as duplicate_id,
  FIRST_VALUE(id) OVER (
    PARTITION BY tenant_id, client_id, channel
    ORDER BY created_at ASC, id ASC
  ) as master_id
FROM conversations;

-- Migrar mensagens para a conversa mestre
UPDATE messages m
SET conversation_id = cdm.master_id
FROM conv_dedup_map cdm
WHERE m.conversation_id = cdm.duplicate_id
  AND cdm.duplicate_id != cdm.master_id;

-- Remover conversas duplicadas
DELETE FROM conversations
WHERE id IN (
  SELECT duplicate_id FROM conv_dedup_map
  WHERE duplicate_id != master_id
);

-- ════════════════════════════════════════════════════════════
-- PASSO 5: Remover clientes duplicados
-- ════════════════════════════════════════════════════════════

DELETE FROM clients
WHERE id IN (
  SELECT duplicate_id FROM client_dedup_map
  WHERE duplicate_id != master_id
);

-- ════════════════════════════════════════════════════════════
-- PASSO 6: Atualizar contadores dos clientes mestres
-- ════════════════════════════════════════════════════════════

UPDATE clients c
SET 
  total_orders = COALESCE((
    SELECT COUNT(*) FROM orders WHERE client_id = c.id
  ), 0),
  ltv = COALESCE((
    SELECT SUM(total) FROM orders WHERE client_id = c.id AND payment_status = 'paid'
  ), 0),
  avg_ticket = COALESCE((
    SELECT AVG(total) FROM orders WHERE client_id = c.id
  ), 0),
  last_order_at = (
    SELECT MAX(created_at) FROM orders WHERE client_id = c.id
  ),
  updated_at = NOW()
WHERE EXISTS (SELECT 1 FROM client_dedup_map WHERE master_id = c.id);

-- ════════════════════════════════════════════════════════════
-- PASSO 7: Atualizar metadados das conversas
-- ════════════════════════════════════════════════════════════

UPDATE conversations c
SET 
  message_count = COALESCE((
    SELECT COUNT(*) FROM messages WHERE conversation_id = c.id
  ), 0),
  unread_count = COALESCE((
    SELECT COUNT(*) FROM messages 
    WHERE conversation_id = c.id 
      AND direction = 'inbound' 
      AND status != 'read'
  ), 0),
  last_message_at = (
    SELECT MAX(created_at) FROM messages WHERE conversation_id = c.id
  ),
  last_message_text = (
    SELECT content FROM messages 
    WHERE conversation_id = c.id 
    ORDER BY created_at DESC 
    LIMIT 1
  ),
  updated_at = NOW();

-- ════════════════════════════════════════════════════════════
-- PASSO 8: Limpar tabelas temporárias
-- ════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS client_dedup_map;
DROP TABLE IF EXISTS conv_dedup_map;

-- ════════════════════════════════════════════════════════════
-- RESULTADO ESPERADO:
-- - Cada telefone tem apenas 1 cliente
-- - Cada cliente tem apenas 1 conversa por canal
-- - Todas as mensagens consolidadas
-- - Contadores atualizados
-- ════════════════════════════════════════════════════════════
