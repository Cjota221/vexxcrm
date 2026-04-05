-- Coluna para armazenar o Page Access Token separado do User Access Token.
-- O meta_access_token continua sendo o User token (para /me/accounts).
-- O meta_page_token é o Page-specific token (para Instagram DM send, Graph API name lookup).
ALTER TABLE ai_provider_config ADD COLUMN IF NOT EXISTS meta_page_token TEXT;
