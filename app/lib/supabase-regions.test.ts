import { describe, it, expect } from 'vitest';
import { groupRegionsByContinent } from './supabase-regions';

describe('groupRegionsByContinent', () => {
  it('raggruppa per continente ricavandolo dal prefisso della region AWS', () => {
    const groups = groupRegionsByContinent([
      { id: 'eu-west-2', name: 'West EU (London)' },
      { id: 'us-east-1', name: 'East US (North Virginia)' },
      { id: 'ap-northeast-1', name: 'Northeast Asia (Tokyo)' },
    ]);

    expect(groups.map((g) => g.title)).toEqual(['Europa', 'America del Nord', 'Asia e Pacifico']);
    expect(groups[0].options).toEqual([{ label: 'West EU (London)', value: 'eu-west-2' }]);
  });

  it('mette Europa per prima e omette i gruppi vuoti', () => {
    const groups = groupRegionsByContinent([
      { id: 'sa-east-1', name: 'South America (São Paulo)' },
      { id: 'eu-central-1', name: 'Central EU (Frankfurt)' },
    ]);

    // Europa prima anche se nell'input arriva dopo; nessun gruppo senza opzioni.
    expect(groups.map((g) => g.title)).toEqual(['Europa', 'America del Sud']);
  });

  it('tiene Canada e Stati Uniti nello stesso gruppo', () => {
    const groups = groupRegionsByContinent([
      { id: 'ca-central-1', name: 'Canada (Central)' },
      { id: 'us-west-1', name: 'West US (North California)' },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBe('America del Nord');
    expect(groups[0].options.map((o) => o.value)).toEqual(['ca-central-1', 'us-west-1']);
  });

  it('preserva l’ordine di arrivo dentro ogni gruppo', () => {
    const groups = groupRegionsByContinent([
      { id: 'eu-west-3', name: 'Paris' },
      { id: 'eu-west-1', name: 'Ireland' },
      { id: 'eu-west-2', name: 'London' },
    ]);

    expect(groups[0].options.map((o) => o.value)).toEqual(['eu-west-3', 'eu-west-1', 'eu-west-2']);
  });

  it('raccoglie in "Altre regioni" i prefissi sconosciuti senza perderli', () => {
    // listRegions puo' restituire id dinamici dalla Management API: una region
    // nuova non deve sparire dal dropdown solo perche' non la mappiamo ancora.
    const groups = groupRegionsByContinent([
      { id: 'eu-west-2', name: 'London' },
      { id: 'xx-nuova-1', name: 'Region Sconosciuta' },
    ]);

    expect(groups.map((g) => g.title)).toEqual(['Europa', 'Altre regioni']);
    expect(groups[1].options).toEqual([{ label: 'Region Sconosciuta', value: 'xx-nuova-1' }]);
  });

  it('ritorna un array vuoto se non ci sono region', () => {
    expect(groupRegionsByContinent([])).toEqual([]);
  });
});
