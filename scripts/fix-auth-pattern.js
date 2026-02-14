/**
 * Script para corrigir o padrão de autenticação em todas as API routes.
 * 
 * Problema: createServerSupabaseClient() (service_role key) + auth.getUser(token)
 *           pode rejeitar tokens de usuário em versões mais recentes do Supabase.
 * 
 * Solução: createAuthenticatedClient(token) (anon key + Bearer) + auth.getUser()
 *          para validação do token, mantendo service client para queries de dados.
 */

const fs = require('fs');
const path = require('path');

const files = [
  'src/app/api/auth/session/route.ts',
  'src/app/api/clients/route.ts',
  'src/app/api/products/route.ts',
  'src/app/api/dashboard/route.ts',
  'src/app/api/tenants/config/route.ts',
  'src/app/api/anne/chat/route.ts',
  'src/app/api/clients/[id]/route.ts',
  'src/app/api/products/[id]/route.ts',
  'src/app/api/auth/avatar/route.ts',
  'src/app/api/clients/[id]/health/route.ts',
  'src/app/api/sentinela/scan/route.ts',
  'src/app/api/intelligence/overview/route.ts',
  'src/app/api/intelligence/rfm/route.ts',
  'src/app/api/intelligence/events/route.ts',
  'src/app/api/intelligence/seasonal/route.ts',
  'src/app/api/intelligence/products/route.ts',
  'src/app/api/intelligence/assistant/route.ts',
  'src/app/api/import/process/route.ts',
  'src/app/api/contact-center/queues/route.ts',
  'src/app/api/contact-center/pull/route.ts',
  'src/app/api/contact-center/transfer/route.ts',
  'src/app/api/contact-center/quick-actions/route.ts',
  'src/app/api/contact-center/send-product/route.ts',
  'src/app/api/contact-center/stats/route.ts',
  'src/app/api/anne/analyze/route.ts',
  'src/app/api/anne/approve/route.ts',
  'src/app/api/anne/feedback/route.ts',
];

let fixed = 0;
let skipped = 0;
let noMatch = 0;

files.forEach(f => {
  const fp = path.join(process.cwd(), f);
  
  if (!fs.existsSync(fp)) {
    console.log('SKIP (not found):', f);
    skipped++;
    return;
  }
  
  let content = fs.readFileSync(fp, 'utf8');
  const original = content;
  
  if (content.includes('createAuthenticatedClient')) {
    console.log('SKIP (already fixed):', f);
    skipped++;
    return;
  }
  
  // Step 1: Add createAuthenticatedClient to import
  content = content.replace(
    "import { createServerSupabaseClient } from '@/lib/supabase';",
    "import { createServerSupabaseClient, createAuthenticatedClient } from '@/lib/supabase';"
  );
  
  // Step 2: Replace the auth pattern
  // Pattern A: const supabase = createServerSupabaseClient(); ... supabase.auth.getUser(token)
  // This handles multiple occurrences in the same file (GET + POST etc.)
  
  // Replace all occurrences of supabase.auth.getUser(token)
  content = content.replace(
    /await supabase\.auth\.getUser\(token\)/g,
    'await supabaseAuth.auth.getUser()'
  );
  
  // Now we need to add supabaseAuth creation before each supabase = createServerSupabaseClient()
  // But we need the token variable to already exist. Let's handle this carefully.
  
  // For files with the local getAuth() helper function pattern:
  // These define a function getAuth that has: const supabase = createServerSupabaseClient();
  // We need to add supabaseAuth there too
  
  // Pattern: "const supabase = createServerSupabaseClient();" that's NOT already preceded by supabaseAuth
  content = content.replace(
    /const supabase = createServerSupabaseClient\(\);/g,
    'const supabaseAuth = createAuthenticatedClient(token);\n    const supabase = createServerSupabaseClient();'
  );
  
  if (content !== original) {
    fs.writeFileSync(fp, content, 'utf8');
    fixed++;
    console.log('FIXED:', f);
  } else {
    noMatch++;
    console.log('NO MATCH:', f);
  }
});

console.log(`\nDone! Fixed: ${fixed}, Skipped: ${skipped}, No match: ${noMatch}`);
