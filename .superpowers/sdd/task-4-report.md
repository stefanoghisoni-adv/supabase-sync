# Task 4: Allowlist tabelle e inoltro con service_role — Report

## Status
✅ **COMPLETATO**

## Implementazione
- **forward.server.ts**: 40 righe
  - `allowedReadTables(customersEnabled)` — restituisce ['products'] o ['products', 'customers']
  - `buildSupabaseReadUrl(projectRef, table, search)` — costruisce URL Supabase con host dal ref (anti-SSRF), scarta querystring vuota o '?'
  - `forwardRead(ctx, table, search)` — inoltra GET con apikey e Authorization Bearer (service_role), propaga status/body/content-type

- **forward.test.ts**: 4 test che validano:
  - allowlist tabelle per stato customersEnabled
  - URL costruito con host dal ref e querystring preservata
  - inoltro GET con service_role e propagazione di status/body/content-type

## Test
```
✓ app/lib/read-proxy/forward.test.ts (4 tests) 5ms
  ✓ allowedReadTables: solo products senza clienti; products+customers con clienti
  ✓ buildSupabaseReadUrl: host dal ref, querystring preservata
  ✓ buildSupabaseReadUrl: nessuna querystring quando vuota o "?"
  ✓ forwardRead: inoltra con service_role e propaga status/body/content-type
```

## TypeCheck
✓ Nessun errore di tipo (npx tsc --noEmit)

## Commit Hash
`85d9f97` — feat: allowlist tabelle e inoltro con service_role (anti-SSRF)

## Considerazioni
- Host derivato SOLO dal projectRef memorizzato nel DB (via ShopReadContext), nessun input utente nell'URL (protezione SSRF)
- Service_role usata solo lato server per inoltro, mai esposta al client
- Querystring vuota o solo '?' scartata (querystring building logic)
- Accept: application/json impostato per comunicare il formato atteso
- Content-Type fallback a 'application/json' se header non presente

---

## Fix di Sicurezza (2026-07-20, commit `aacb9a3`)
**Problema**: Code review ha trovato vulnerabilità SSRF residua e lacune nei test.

**Correzioni applicate**:
1. **Validazione difensiva in `buildSupabaseReadUrl`**:
   - `table`: deve matchare `/^[a-z_]+$/` (solo lettere minuscole e underscore) → lancia errore se non valido
   - `projectRef`: deve matchare `/^[a-z0-9]+$/` (solo minuscole e cifre, nessun `.`/`/`/`@`/`:`) → lancia errore se non valido
   - Guscio di sicurezza "non dovrebbe mai scattare" perché la route filtra già `table` sull'allowlist, ma difende da bug futuri o usi diretti

2. **Test aggiunti** (8 test totali, erano 4):
   - Input validi (`'abcref'`, `'products'`, `'abc123'`, `'customers'`) non lanciano errore
   - `table` malevolo (`'products/../x'`, `'products@evil'`, `'Products'`, `'prod-ucts'`) lancia `'Nome tabella non valido'`
   - `projectRef` malevolo (`'evil.com'`, `'ref/../x'`, `'ref@evil'`, `'ref:8080'`) lancia `'Project ref non valido'`
   - `forwardRead` propaga status non-200 (403 con body `'{"error":"x"}'`) invariato

**Test**: ✓ 8 passed (8) — `npx vitest run app/lib/read-proxy/forward.test.ts`  
**TypeCheck**: ✓ Nessun errore — `npx tsc --noEmit`  
**Commit Hash**: `aacb9a3` — fix(read-proxy): aggiungi validazione difensiva anti-SSRF e test
