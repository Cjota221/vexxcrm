# 📸 Diagnóstico: Imagens não aparecem nas conversas

## Possíveis Causas

### 1. ❌ Type não está sendo detectado como 'image'
- **Local:** `src/app/api/webhooks/evolution/route.ts` (linhas 205-211)
- **Código detecta:** `messageContent.imageMessage` para imagem
- **Se falha:** Mensagem salva com `type='text'` e `media_url` vazio
- **Check:** Verificar logs do webhook — deve vir `[Webhook] Tipos de mídia no payload: imageMessage`

### 2. ❌ media_url vazio no banco
- **Possível causa:** URL não extraída corretamente de `imageMessage.url` ou `.directPath`
- **Fallback:** Se URL falha em download para Storage, mantém URL original
- **Check:** Query no banco: `SELECT id, type, media_url FROM messages WHERE type='image' LIMIT 5`

### 3. ❌ Download para Storage falhou
- **Local:** `src/lib/services/evolution.service.ts` — `downloadMediaToStorage()`
- **Causas possíveis:**
  - `webhook_base64: false` no payload — não vem base64 da Evolution
  - `getBase64FromMediaMessage` falha (credenciais, timeout)
  - Arquivo muito grande (>25MB)
- **Check:** Logs do webhook — deve vir `[Webhook] Tentando baixar mídia: type=image...`

### 4. ❌ URL expirou
- **Problema:** URLs do WhatsApp (`mmg.whatsapp.net`) expiram em horas
- **Se storage falhou:** URL original fica no banco → depois não funciona mais
- **Check:** `curl -I https://URL_DA_IMAGEM` — retornar 403 Forbidden?

### 5. ❌ Front-end não renderiza mesmo com URL correta
- **Se media_url está no banco:** Problema no `MessageBubble.tsx`
- **Check:** Verificar se `currentMediaUrl` está correto e `<MediaMessage>` renderiza

## Ações Imediatas

### ✅ 1. Verificar Logs do Webhook
- Ao receber uma imagem, procure no servidor:
```
[Webhook] Tipos de mídia no payload: imageMessage
[Webhook] Tentando baixar mídia: type=image, mediaUrl=...
[Webhook] Mídia salva permanentemente: https://...
```

### ✅ 2. Verificar Banco (Query)
```sql
-- Imagens com URL
SELECT id, type, media_url, created_at 
FROM messages 
WHERE type = 'image' 
  AND media_url IS NOT NULL
LIMIT 5;

-- Imagens sem URL (problema!)
SELECT id, type, media_url, created_at 
FROM messages 
WHERE type = 'image' 
  AND media_url IS NULL
LIMIT 5;
```

### ✅ 3. Verificar Storage
```bash
# No Supabase Dashboard → Storage → media
# Procure por arquivos com padrão: {tenantId}/{timestamp}-{messageId}.{ext}
# Se vazio = download não funcionou
```

### ✅ 4. Teste Manual de Envio
1. Envie uma imagem via chat
2. Verifique logs do webhook
3. Consulte banco para confirmar `type='image'` e `media_url` preenchida
4. Teste URL com: `curl -I {media_url}`

## Cambios Recentes (Commit `aa240ed`)

Adicionados **logs detalhados** no webhook para ajudar a diagnosticar:
- `[Webhook] Tipos de mídia no payload: ...` — debug
- `[Webhook] Tentando baixar mídia: type=...` — início do download
- `[Webhook] Mídia salva permanentemente: ...` — sucesso
- `[Webhook] Falha ao baixar mídia, usando URL original` — fallback

## Próximos Passos

1. **Envie uma imagem agora** e compartilhe os logs do servidor
2. **Verifique se há mensagens com type='image'** e media_url não vazio
3. **Se Storage está vazio** → problema está em `downloadMediaToStorage`
4. **Se URL expirou** → configurar `webhook_base64: true` corretamente

## Referências

- Evolution API: `/message/sendMedia` para envio
- Supabase Storage: bucket `media` com chave pública
- WhatsApp URLs: expira em ~24 horas, por isso precisa cachear no Storage
