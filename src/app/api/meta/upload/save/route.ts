/**
 * POST /api/meta/upload/save
 * Salva no banco um criativo cujo upload foi feito direto do browser para o Meta.
 * Body: { nome, tipo, metaVideoId?, metaImageHash?, thumbUrl?, tamanhoBytes, duracaoSegundos? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { salvarCriativoNoBanco } from '@/lib/services/meta-upload.service';

export async function POST(req: NextRequest) {
  let tenantId: string;
  try {
    const auth = await getTenantFromRequest(req);
    tenantId = auth.tenantId;
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const body = await req.json() as {
    nome: string;
    tipo: 'video' | 'imagem';
    metaVideoId?: string;
    metaImageHash?: string;
    thumbUrl?: string;
    tamanhoBytes?: number;
    duracaoSegundos?: number;
  };

  if (!body.nome || !body.tipo) {
    return NextResponse.json({ error: 'nome e tipo são obrigatórios' }, { status: 400 });
  }

  try {
    const id = await salvarCriativoNoBanco({ tenantId, ...body });

    // Disparar transcrição em background para vídeos
    if (body.tipo === 'video' && id) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
      fetch(`${appUrl}/api/meta/transcricao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId },
        body: JSON.stringify({ criativoId: id }),
      }).catch(err => console.error('[Save] Erro ao disparar transcrição:', err));
    }

    return NextResponse.json({ ok: true, id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
