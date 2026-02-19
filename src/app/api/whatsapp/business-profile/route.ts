import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { getTenantEvolutionConfig } from '@/lib/services/evolution.service';

/**
 * GET /api/whatsapp/business-profile?jid=5521999999999
 * 
 * Consulta o perfil comercial (Business) de um contato WhatsApp
 * via Evolution API endpoint: /chat/fetchBusinessProfile/{instance}
 * 
 * Retorna: description, email, website, address, category, isBusiness
 */
export async function GET(request: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(request);
    const config = getTenantEvolutionConfig(profile.tenant_id);

    const { searchParams } = new URL(request.url);
    const jid = searchParams.get('jid') || searchParams.get('phone');

    if (!jid) {
      return NextResponse.json({ error: 'Parâmetro jid ou phone é obrigatório' }, { status: 400 });
    }

    // Normalizar JID
    const cleanPhone = jid.replace(/[^0-9]/g, '');
    const whatsappJid = cleanPhone.includes('@') ? cleanPhone : `${cleanPhone}@s.whatsapp.net`;

    // 1. Tentar queryBusinessProfile
    let businessData: Record<string, unknown> | null = null;

    try {
      const response = await fetch(
        `${config.apiUrl}/chat/fetchBusinessProfile/${config.instanceName}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': config.apiKey,
          },
          body: JSON.stringify({ number: cleanPhone }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        businessData = data;
      }
    } catch {
      // Não é business — OK
    }

    // 2. Tentar fetchProfilePictureUrl
    let profilePicUrl: string | null = null;
    try {
      const picRes = await fetch(
        `${config.apiUrl}/chat/fetchProfilePictureUrl/${config.instanceName}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': config.apiKey,
          },
          body: JSON.stringify({ number: cleanPhone }),
        }
      );
      if (picRes.ok) {
        const picData = await picRes.json();
        profilePicUrl = picData.profilePictureUrl || picData.profilePicUrl || picData.picture || null;
      }
    } catch {
      // Silencia
    }

    // 3. Montar resposta normalizada
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bd = (businessData ?? {}) as any;
    const isBusiness = !!(
      businessData &&
      (bd.isBusiness || bd.business || (typeof bd.wid === 'string' && bd.wid.includes('s.whatsapp.net')))
    );

    const bp = bd;
    const profile_data = {
      is_business: isBusiness,
      description: bp.description || bp.about || bp.status || null,
      email: bp.email || null,
      website: Array.isArray(bp.website) ? bp.website : (bp.website ? [bp.website] : []),
      address: bp.address || null,
      category: bp.category || bp.businessCategory || null,
      business_hours: bp.businessHours || null,
      profile_pic_url: profilePicUrl,
      catalog_url: bp.catalogUrl || bp.catalog || null,
      jid: whatsappJid,
    };

    return NextResponse.json(profile_data);
  } catch (err) {
    console.error('[BUSINESS_PROFILE]', err);
    return NextResponse.json({ error: 'Erro ao buscar perfil business' }, { status: 500 });
  }
}
