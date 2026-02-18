const fs = require('fs');

const N8N_URL = 'https://cjota-n8n-02.9eo9b2.easypanel.host';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1Y2Q3MTc2ZC1jOTdkLTQwZmEtOGQwMy1kNjFiYjE4YzBjMGIiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMTdhYWYwZTMtODk2Zi00MmUyLWFkMzQtMWYwYzM2Y2Y1YmY3IiwiaWF0IjoxNzcxMzczNjU4fQ.M3906_9IVcsfB6FfIzCbnvw6LGW6rQ69ocnMQYXkyhQ';

async function main() {
  const raw = fs.readFileSync('n8n/vexx-media-processing-workflow.json', 'utf8');
  const wf = JSON.parse(raw);
  
  // Limpar campos que a API não aceita
  const payload = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings
  };

  console.log('Criando workflow no n8n...');
  
  const res = await fetch(`${N8N_URL}/api/v1/workflows`, {
    method: 'POST',
    headers: {
      'X-N8N-API-KEY': API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  
  if (!res.ok) {
    console.error('Erro:', res.status, JSON.stringify(data, null, 2));
    return;
  }

  console.log(`✅ Workflow criado! ID: ${data.id}`);
  console.log(`   Nome: ${data.name}`);
  
  // Ativar o workflow
  console.log('Ativando workflow...');
  const activateRes = await fetch(`${N8N_URL}/api/v1/workflows/${data.id}/activate`, {
    method: 'POST',
    headers: { 'X-N8N-API-KEY': API_KEY }
  });
  
  if (activateRes.ok) {
    console.log('✅ Workflow ativado!');
    console.log(`   Webhook URL: ${N8N_URL}/webhook/media-process`);
  } else {
    const err = await activateRes.json();
    console.log('⚠️  Não foi possível ativar (pode precisar configurar credenciais OpenAI primeiro)');
    console.log('   Erro:', JSON.stringify(err));
  }
}

main().catch(console.error);
