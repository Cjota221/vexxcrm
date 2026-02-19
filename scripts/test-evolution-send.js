require('dotenv').config({ path: '.env.local' });

const tid = '8aa3a7e7-cbb5-4ad5-8e2a-740d914aefdd';
const inst = 'vexx-' + tid.replace(/-/g, '').slice(0, 12);
const baseUrl = process.env.EVOLUTION_API_URL;
const key = process.env.EVOLUTION_GLOBAL_KEY;
const imgUrl = 'https://qjjflshqdaapwneeirdq.supabase.co/storage/v1/object/public/criativos/campanhas/8aa3a7e7-cbb5-4ad5-8e2a-740d914aefdd/image/1771532086703_4a017916.webp';

console.log('Instance:', inst);
console.log('Base URL:', baseUrl);

async function test() {
  // Test 1: sendImage with mediaUrl
  const url1 = `${baseUrl}/message/sendImage/${inst}`;
  console.log('\n--- Test 1: sendImage with { number, mediaUrl, caption } ---');
  console.log('URL:', url1);
  
  try {
    const r1 = await fetch(url1, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': key },
      body: JSON.stringify({ number: '5563992490678', mediaUrl: imgUrl, caption: 'Teste 1' }),
    });
    console.log('Status:', r1.status);
    const t1 = await r1.text();
    console.log('Body:', t1.substring(0, 500));
  } catch (e) {
    console.error('Error:', e.message);
  }

  // Test 2: sendImage with media (Evolution API v2 format)
  const url2 = `${baseUrl}/message/sendMedia/${inst}`;
  console.log('\n--- Test 2: sendMedia with { number, media, mediatype, caption } ---');
  console.log('URL:', url2);
  
  try {
    const r2 = await fetch(url2, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': key },
      body: JSON.stringify({ number: '5563992490678', media: imgUrl, mediatype: 'image', caption: 'Teste 2' }),
    });
    console.log('Status:', r2.status);
    const t2 = await r2.text();
    console.log('Body:', t2.substring(0, 500));
  } catch (e) {
    console.error('Error:', e.message);
  }

  // Test 3: Check if instance exists
  const url3 = `${baseUrl}/instance/fetchInstances`;
  console.log('\n--- Test 3: List instances ---');
  try {
    const r3 = await fetch(url3, {
      method: 'GET',
      headers: { 'apikey': key },
    });
    console.log('Status:', r3.status);
    const t3 = await r3.text();
    // Show just instance names
    try {
      const instances = JSON.parse(t3);
      if (Array.isArray(instances)) {
        console.log('Instances:', instances.map(i => i.instance?.instanceName || i.instanceName || i.name).filter(Boolean));
      } else {
        console.log('Body:', t3.substring(0, 300));
      }
    } catch {
      console.log('Body:', t3.substring(0, 300));
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
}

test();
