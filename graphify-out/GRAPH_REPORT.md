# Graph Report - .  (2026-07-13)

## Corpus Check
- Corpus is ~12,820 words - fits in a single context window. You may not need a graph.

## Summary
- 251 nodes · 321 edges · 24 communities (15 shown, 9 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Queue Dependencies
- Remix Framework
- Package Ecosystem
- Redis Configuration
- Database Schema
- Client Factories
- Issue Tracking
- Build Tools
- Product Sync
- Encryption API
- Crypto Utilities
- Test Database
- Security Review
- OAuth Setup
- Data Seeding
- App Root
- Webhook Types
- Part Plans
- Bulk Sync
- Manual Sync
- Periodic Sync
- Retry Logic

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 17 edges
2. `verifyWebhook()` - 12 edges
3. `createSupabaseClient()` - 11 edges
4. `scripts` - 9 edges
5. `Final review report` - 9 edges
6. `app/lib/supabase.server.ts` - 8 edges
7. `app/lib/webhooks/verify.server.ts` - 8 edges
8. `app/routes/webhooks.products.create.tsx` - 8 edges
9. `ShopifyProduct` - 7 edges
10. `include` - 7 edges

## Surprising Connections (you probably didn't know these)
- `Shopify Supabase Sync` --uses--> `BullMQ job queue`  [EXTRACTED]
  README.md → worker.ts
- `app/lib/supabase.server.ts` --consumes--> `SupabaseConfig model`  [EXTRACTED]
  app/lib/supabase.server.ts → .superpowers/sdd/task-4-brief.md
- `app/routes/webhooks.products.create.tsx` --calls--> `app/lib/supabase.server.ts`  [EXTRACTED]
  .superpowers/sdd/task-6-brief.md → app/lib/supabase.server.ts
- `app/lib/transformers/product.server.ts` --implements--> `Product webhook sync to Supabase`  [EXTRACTED]
  app/lib/transformers/product.server.ts → .superpowers/sdd/task-6-brief.md
- `app/routes/webhooks.products.create.tsx` --calls--> `app/lib/webhooks/verify.server.ts`  [EXTRACTED]
  .superpowers/sdd/task-6-brief.md → app/lib/webhooks/verify.server.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Webhook Sync Pattern** — verify_verifyWebhook, supabase_createSupabaseClient, db_prisma [EXTRACTED 1.00]
- **Product Data Transformation Flow** — types_ShopifyProduct, product_transformProduct, types_SupabaseProductRow [EXTRACTED 1.00]
- **GDPR Request Handlers** — gdpr_customers_action, gdpr_data_action, gdpr_shop_action [INFERRED 0.90]
- **Webhook handler processing pipeline** — file_webhook_products_create, file_webhook_verify, file_product_transformer, file_supabase_server, file_db_server [EXTRACTED 0.95]
- **GDPR compliance webhook handlers** — file_webhook_gdpr_data_request, file_webhook_gdpr_customers_redact, file_webhook_gdpr_shop_redact [EXTRACTED 0.95]
- **Core sync and worker infrastructure** — file_worker_ts, queue_bullmq, queue_redis, database_prisma [EXTRACTED 0.90]

## Communities (24 total, 9 thin omitted)

### Community 0 - "Queue Dependencies"
Cohesion: 0.05
Nodes (37): bullmq, crypto-js, dotenv, ioredis, isbot, dependencies, bullmq, crypto-js (+29 more)

### Community 1 - "Remix Framework"
Cohesion: 0.06
Nodes (30): ./app/*, **/.client/**/*.ts, **/.client/**/*.tsx, DOM, DOM.Iterable, ES2022, **/.server/**/*.ts, **/.server/**/*.tsx (+22 more)

### Community 2 - "Package Ecosystem"
Cohesion: 0.07
Nodes (26): ioredis, @prisma/client, @remix-run/* dependencies, @shopify/polaris (UI components), vitest testing, zod validation, author, description (+18 more)

### Community 3 - "Redis Configuration"
Cohesion: 0.11
Nodes (22): getRedisUrl(), connectionOptions, redisUrl, SyncJobData, syncQueue, url, processInitialBulkSync(), processManualSync() (+14 more)

### Community 4 - "Database Schema"
Cohesion: 0.10
Nodes (26): GDPR silent failures, Prisma PostgreSQL (app database), Supabase (merchant PostgreSQL), Plan model (billing tiers), Shop model, SupabaseConfig model, SyncJob model (audit trail), @supabase/supabase-js (+18 more)

### Community 5 - "Client Factories"
Cohesion: 0.21
Nodes (11): createSupabaseClient(), verifyWebhook(), Index, loader, action(), action(), action(), NOTE: We do NOT delete data from merchant's Supabase (+3 more)

### Community 6 - "Issue Tracking"
Cohesion: 0.14
Nodes (16): ShopifyProduct type, Upsert duplication for NULL variant_id, Stale variants not deleted, Final review report, Part 1 Foundation Plan, Product webhook sync to Supabase, app/lib/transformers/product.test.ts, app/lib/transformers/product.server.ts (+8 more)

### Community 7 - "Build Tools"
Cohesion: 0.15
Nodes (13): devDependencies, @remix-run/dev, tsx, @types/crypto-js, vite, vitest, @vitest/ui, @remix-run/dev (+5 more)

### Community 8 - "Product Sync"
Cohesion: 0.33
Nodes (8): getVariantImageUrl(), transformProduct(), ShopifyImage, ShopifyProduct, ShopifyVariant, SupabaseProductRow, getVariantImageUrl, transformProduct

### Community 9 - "Encryption API"
Cohesion: 0.36
Nodes (11): decrypt, encrypt, getEncryptionKey, prisma, action, action, action, action (+3 more)

### Community 10 - "Crypto Utilities"
Cohesion: 0.80
Nodes (3): decrypt(), encrypt(), getEncryptionKey()

### Community 11 - "Test Database"
Cohesion: 0.40
Nodes (4): @prisma/client, @prisma/client, prisma, testDatabase()

### Community 12 - "Security Review"
Cohesion: 0.50
Nodes (4): Security vulnerabilities report, esbuild CORS vulnerability, tar path traversal vulnerabilities, turbo-stream DoS vulnerability

## Knowledge Gaps
- **113 isolated node(s):** `redisUrl`, `url`, `connectionOptions`, `App`, `loader` (+108 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Queue Dependencies` to `Package Ecosystem`, `Test Database`?**
  _High betweenness centrality (0.168) - this node is a cross-community bridge._
- **Why does `app/lib/supabase.server.ts` connect `Database Schema` to `Issue Tracking`?**
  _High betweenness centrality (0.128) - this node is a cross-community bridge._
- **What connects `redisUrl`, `url`, `connectionOptions` to the rest of the system?**
  _113 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Queue Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.05405405405405406 - nodes in this community are weakly interconnected._
- **Should `Remix Framework` be split into smaller, more focused modules?**
  _Cohesion score 0.06451612903225806 - nodes in this community are weakly interconnected._
- **Should `Package Ecosystem` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._
- **Should `Redis Configuration` be split into smaller, more focused modules?**
  _Cohesion score 0.11076923076923077 - nodes in this community are weakly interconnected._