import { NextResponse } from 'next/server';

// Cadastro público desativado — novos tenants são criados manualmente
export async function POST() {
  return NextResponse.json(
    { error: 'Cadastro temporariamente indisponível. Entre em contato para solicitar acesso.' },
    { status: 403 }
  );
}
