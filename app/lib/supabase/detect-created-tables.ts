// I nomi sono letterali perche' e' esattamente cio' che la DDL crea
// (buildTableSQL li scrive hardcoded); i campi configurabili tableNameProducts /
// tableNameCustomers riguardano il percorso di lettura/scrittura della sync.
export function expectedTables(includeCustomers: boolean): string[] {
  return includeCustomers ? ['products', 'customers'] : ['products'];
}

// Le tabelle attese che NON erano gia' presenti: sono quelle create dalla DDL.
export function detectCreatedTables(
  existing: string[],
  includeCustomers: boolean,
): string[] {
  const present = new Set(existing.map((t) => t.toLowerCase()));
  return expectedTables(includeCustomers).filter((t) => !present.has(t));
}

// jobType che codifica cosa e' stato creato; null se non e' stato creato nulla
// (in quel caso non si registra alcun evento).
export function tableCreationJobType(created: string[]): string | null {
  const hasProducts = created.includes('products');
  const hasCustomers = created.includes('customers');
  if (hasProducts && hasCustomers) return 'table_create_both';
  if (hasProducts) return 'table_create_products';
  if (hasCustomers) return 'table_create_customers';
  return null;
}
