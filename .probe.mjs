import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
const live = fs.readFileSync('.env', 'utf8').split('\n')
  .map((l) => l.replace(/^#\s*/, '').trim())
  .find((l) => l.startsWith('postgresql://') && l.includes('eu-west-3'));
const prisma = new PrismaClient({ datasources: { db: { url: live } } });
const s = await prisma.session.findFirst();
await prisma.$disconnect();
const r = await fetch(`https://${s.shop}/admin/api/2025-01/graphql.json`, {
  method: 'POST',
  headers: { 'X-Shopify-Access-Token': s.accessToken, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: fs.readFileSync(process.argv[2], 'utf8'), variables: JSON.parse(process.argv[3] || '{}') }),
});
const j = await r.json();
console.log('HTTP', r.status);
console.log(JSON.stringify(j, null, 1).slice(0, Number(process.argv[4] || 3000)));
