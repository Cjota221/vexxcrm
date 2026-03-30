/**
 * Configuração central da Meta Graph API.
 * Todos os serviços e rotas devem importar META_BASE daqui
 * para garantir que a versão da API seja atualizada em um único lugar.
 */
export const META_API_VERSION = 'v21.0';
export const META_BASE = `https://graph.facebook.com/${META_API_VERSION}`;
