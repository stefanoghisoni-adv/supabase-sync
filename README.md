# Shopify Supabase Sync

A Shopify embedded app that syncs products and customers to merchant-owned Supabase databases.

## Setup

1. Copy `.env.example` to `.env` and fill in your credentials
2. Install dependencies: `npm install`
3. Run development server: `npm run dev`

## Environment Variables

See `.env.example` for required configuration.

## Tech Stack

- Remix (React Router)
- Shopify App Bridge
- Prisma (PostgreSQL)
- BullMQ (Redis job queue)
- Supabase Client
- TypeScript
