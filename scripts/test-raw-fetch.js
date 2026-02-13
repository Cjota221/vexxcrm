// Test without auth - just check if endpoints return JSON or HTML
(async () => {
  const endpoints = [
    'https://vexxcrm.netlify.app/api/intelligence/seasonal',
    'https://vexxcrm.netlify.app/api/intelligence/products?type=trends',
    'https://vexxcrm.netlify.app/api/intelligence/overview',
  ];

  for (const url of endpoints) {
    console.log(`\n--- ${url.split('/api/')[1]} ---`);
    try {
      const r = await fetch(url);
      console.log('Status:', r.status);
      console.log('Content-Type:', r.headers.get('content-type'));
      const text = await r.text();
      console.log('Body (first 300):', text.substring(0, 300));
    } catch (e) {
      console.error('Error:', e.message);
    }
  }
  process.exit(0);
})();
