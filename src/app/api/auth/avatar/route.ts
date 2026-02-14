import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAuthenticatedClient } from '@/lib/supabase';

/**
 * POST /api/auth/avatar
 * Upload de foto de perfil do usuário.
 * Recebe FormData com campo "file" (imagem).
 */
export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const token = authorization.replace('Bearer ', '');
    const supabaseAuth = createAuthenticatedClient(token);
    const supabase = createServerSupabaseClient();

    // Verificar usuário
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    // Buscar tenant_id
    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    if (!profile?.tenant_id) {
      return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });
    }

    // Validar tipo
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Formato inválido. Use JPG, PNG, WebP ou GIF.' },
        { status: 400 }
      );
    }

    // Validar tamanho (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Arquivo muito grande. Máximo 2MB.' },
        { status: 400 }
      );
    }

    // Gerar nome único
    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `${profile.tenant_id}/${user.id}/avatar.${ext}`;

    // Converter File para Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload para Supabase Storage (bucket "avatars")
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: true, // Sobrescreve se já existir
      });

    if (uploadError) {
      console.error('❌ Upload error:', uploadError);
      return NextResponse.json(
        { error: `Erro no upload: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // Obter URL pública
    const { data: publicUrl } = supabase.storage
      .from('avatars')
      .getPublicUrl(fileName);

    const avatarUrl = publicUrl.publicUrl;

    // Atualizar profile com a URL do avatar
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: avatarUrl })
      .eq('id', user.id);

    if (updateError) {
      console.error('❌ Profile update error:', updateError);
      return NextResponse.json(
        { error: `Erro ao atualizar perfil: ${updateError.message}` },
        { status: 500 }
      );
    }

    console.log('✅ Avatar atualizado:', avatarUrl);

    return NextResponse.json({
      avatar_url: avatarUrl,
      message: 'Foto de perfil atualizada com sucesso!',
    });
  } catch (error) {
    console.error('❌ Avatar upload error:', error);
    return NextResponse.json(
      { error: 'Erro ao fazer upload da foto' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/auth/avatar
 * Remove a foto de perfil do usuário.
 */
export async function DELETE(request: NextRequest) {
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const token = authorization.replace('Bearer ', '');
    const supabaseAuth = createAuthenticatedClient(token);
    const supabase = createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    // Atualizar profile removendo avatar
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: null })
      .eq('id', user.id);

    if (updateError) {
      return NextResponse.json(
        { error: `Erro ao remover foto: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'Foto de perfil removida.' });
  } catch (error) {
    console.error('❌ Avatar delete error:', error);
    return NextResponse.json({ error: 'Erro ao remover foto' }, { status: 500 });
  }
}
