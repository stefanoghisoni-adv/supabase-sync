// Unico modulo che importa polaris-viz. Sta a parte, ed e' caricato SOLO con un
// import dinamico dal browser (vedi EligibilityChart), per una ragione che
// abbiamo pagato in produzione: su Vercel il bundle server risolve il build CJS
// di @shopify/polaris-viz-core, che fa require('d3-scale') — modulo ESM-only.
// Il require esplode con ERR_REQUIRE_ESM al caricamento del modulo, cioe' prima
// ancora che una richiesta venga gestita, e ogni route SSR muore con
// FUNCTION_INVOCATION_FAILED. Tenendo l'import fuori dal grafo del server il
// require non avviene mai.
//
// Non importare questo file staticamente da nessuna parte.
import { LineChart, PolarisVizProvider } from '@shopify/polaris-viz';
import type { DataSeries } from '@shopify/polaris-viz-core';

interface Props {
  series: DataSeries[];
  // Tetto dell'asse Y: forza polaris-viz a lasciare respiro sopra il limite del
  // piano (vedi computeChartYMax). undefined = auto-scale.
  maxY?: number;
}

export default function EligibilityChartCanvas({ series, maxY }: Props) {
  return (
    // polaris-viz richiede un contenitore con altezza esplicita per disegnare:
    // nessun componente Polaris la impone, quindi qui lo style inline e' l'unica
    // eccezione ammessa al vincolo "solo Polaris".
    <div style={{ height: 260 }}>
      <PolarisVizProvider>
        <LineChart
          data={series}
          yAxisOptions={maxY != null ? { maxYOverride: maxY } : undefined}
        />
      </PolarisVizProvider>
    </div>
  );
}
