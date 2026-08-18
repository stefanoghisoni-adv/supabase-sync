import { requireSetupComplete } from '~/lib/setup/require-setup.server';
import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import {
  useLoaderData,
  useFetcher,
  useSearchParams,
  useRevalidator,
} from '@remix-run/react';
import {
  Page,
  InlineGrid,
  Card,
  BlockStack,
  InlineStack,
  Box,
  Text,
  Badge,
  Button,
  ButtonGroup,
  Banner,
} from '@shopify/polaris';
import { SettingsIcon } from '@shopify/polaris-icons';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { buildPlanCards, type PlanCard } from '~/components/Billing/plan-catalog';
import { BASE_CURRENCY, formatMoney, formatMoneyExact } from '~/lib/billing/money';
import { useLocale, useT } from '~/lib/i18n/context';
import type { Locale } from '~/lib/i18n/locales';
import { resolveShopPricing } from '~/lib/billing/shop-pricing.server';
import { wantedCurrency } from '~/lib/i18n/preferences';
import {
  effectivePrice,
  savingBadge,
  type BillingInterval,
  type EffectivePrice,
} from '~/lib/billing/partner-pricing';

/** Testo del risparmio, o niente: decide anche se il badge esiste. */
function savingLabel(price: EffectivePrice, currency: string, locale: Locale): string | null {
  return price.discountAmount > 0
    ? savingBadge(price, formatMoneyExact(price.discountAmount, currency, locale))
    : null;
}
import { shouldHighlightRecommended } from '~/components/Billing/plan-highlight';
import { canAccessPlanTab } from '~/components/Billing/plan-access';
import { PlanFeatureList } from '~/components/Billing/PlanFeatureList';
import {
  planButtonLabel,
  planButtonState,
  billingOutcome,
  billingBanner,
} from '~/components/Billing/plan-cta';
import { useEffect, useState } from 'react';
import { useNavLoading } from '~/components/Dashboard/nav-loading';

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  // Questa pagina esiste a configurazione conclusa: prima parlerebbe di dati
  // che non ci sono ancora. Chi ci arriva da un indirizzo salvato torna dove
  // il lavoro e' rimasto.
  await requireSetupComplete(session.shop);
  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
  });
  // Normalizzato in minuscolo per combaciare con gli id del catalogo. Se il piano
  // corrente non e' tra i 4 (es. 'lifetime'), nessuna card risultera' "attuale".
  const currentPlan = (shop?.currentPlan ?? '').toLowerCase();

  // Il link sparisce dalla NavMenu, ma /plan resta digitabile: il blocco vero sta
  // qui. 403 anche nello status, non solo a schermo.
  if (!canAccessPlanTab(currentPlan)) {
    return json(
      {
        currentPlan,
        blocked: true as const,
        cards: [] as PlanCard[],
        discountIntervals: null,
        partnerLabel: null,
        currency: BASE_CURRENCY,
      },
      { status: 403 },
    );
  }

  // Le card vengono dal listino registrato, non da una copia nel codice: nomi,
  // prezzi e limiti sono quelli che l'app applica davvero.
  const plans = await prisma.plan.findMany();
  // Listino riservato del partner a cui il negozio appartiene. Serve solo a
  // mostrare i prezzi giusti: quello che viene addebitato lo ricalcola comunque
  // /billing/subscribe leggendo il database, perche' il prezzo in fattura non
  // puo' dipendere da cosa il browser ha ricevuto.
  const partnerPrices = shop?.partnerName
    ? await prisma.partnerPlanPrice.findMany({ where: { partnerName: shop.partnerName } })
    : [];

  // Solo se ci sono davvero prezzi riservati: un partner senza listino non da'
  // diritto a niente, e annunciare una riduzione inesistente sarebbe peggio che
  // tacere.
  const partnerLabel =
    shop?.partnerName && partnerPrices.length > 0
      ? (await prisma.partner.findUnique({ where: { name: shop.partnerName } }))?.label ?? null
      : null;
  const reserved = Object.fromEntries(
    partnerPrices.map((p) => [
      p.planName,
      { priceMonthly: Number(p.priceMonthly), priceYearly: Number(p.priceYearly) },
    ]),
  );



  // Valuta del negozio e listino gia' scritto in quella valuta: i prezzi che si
  // leggono qui sono gli stessi che /billing/subscribe ricalcola per la fattura.
  const pricing = await resolveShopPricing(
    plans.map((plan) => ({
      planName: plan.planName,
      priceMonthly: Number(plan.priceMonthly),
      priceYearly: Number(plan.priceYearly),
      maxProducts: plan.maxProducts,
      maxCustomers: plan.maxCustomers,
      maxSyncFrequencyHours: plan.maxSyncFrequencyHours,
      customersSyncEnabled: plan.customersSyncEnabled,
      supportLevel: plan.supportLevel,
    })),
    { preferredCurrency: wantedCurrency(shop), hasReservedPrice: partnerPrices.length > 0 },
  );

  const cards = buildPlanCards(pricing.plans, reserved);

  return json({
    currentPlan,
    blocked: false as const,
    cards,
    // Per quanti cicli vale il prezzo riservato: serve a dirlo nella pagina,
    // altrimenti il merchant crede che quella cifra sia per sempre.
    discountIntervals: shop?.discountIntervals ?? null,
    // Nome per esteso del partner, da mostrare nel riquadro informativo. Si
    // legge da partners.label e non dal nome tecnico: "WeBeing", non "webeing".
    partnerLabel: partnerLabel,
    // La valuta viaggia con i prezzi: le card non devono indovinarla.
    currency: pricing.currency,
  });
}

// Contratto della risposta di /billing/subscribe (endpoint di un altro task).
type SubscribeResponse =
  | { confirmationUrl: string }   // serve uscire dall'iframe verso questo URL
  | { ok: true }                  // piano applicato subito (piano gratuito): ricarica
  | { error: string };            // messaggio già in italiano, da mostrare in un Banner

export default function Plan() {
  const { currentPlan, blocked, cards, discountIntervals, partnerLabel, currency } =
    useLoaderData<typeof loader>();
  const locale = useLocale();
  const t = useT();

  // Quanto si risparmia al massimo scegliendo l'annuale, sul listino che il
  // merchant vede davvero (riservato se ce l'ha). Serve alla riga accanto al
  // selettore: senza, l'annuale sembra solo un impegno piu' lungo.
  // Mensile di partenza: e' l'impegno piu' leggero, e chi arriva qui sta ancora
  // decidendo se il servizio gli serve.
  const [interval, setInterval] = useState<BillingInterval>('monthly');

  // Se anche una sola card mostra il risparmio, tutte riservano quella riga:
  // altrimenti gli elenchi partono ad altezze diverse e le card, affiancate,
  // sembrano disallineate. Quando nessuno ha uno sconto la riga non esiste
  // proprio, e nessuno paga uno spazio vuoto.
  const anyDiscount = cards.some((plan) =>
    interval === 'yearly'
      ? plan.partnerYearly != null && plan.partnerYearly < plan.priceYearly
      : plan.partnerMonthly != null && plan.partnerMonthly < plan.priceMonthly,
  );

  const yearlySaving = cards.reduce<number | null>((best, plan) => {
    const monthly = plan.partnerMonthly ?? plan.priceMonthly;
    const yearly = plan.partnerYearly ?? plan.priceYearly;
    if (!(monthly > 0) || !(yearly > 0)) return best;
    const saving = monthly * 12 - yearly;
    return saving > (best ?? 0) ? saving : best;
  }, null);

  // Il "Consigliato" si risalta solo se è un upgrade rispetto al piano attuale.
  const highlightRecommended = shouldHighlightRecommended(cards, currentPlan);

  // Spinner e disabilitazione solo se e' stato questo pulsante a far partire
  // la navigazione: dal menu laterale dell'admin deve restare fermo.
  const settings = useNavLoading('/settings/supabase');

  // Fetcher per inviare il POST a /billing/subscribe. Un fetcher per pagina, non
  // uno per card: lo stato locale (submittingPlan) traccia quale piano è in corso.
  const fetcher = useFetcher<SubscribeResponse>();
  const [submittingPlan, setSubmittingPlan] = useState<string | null>(null);

  // Legge il parametro querystring ?billing=ok|ko dopo il ritorno dal flusso.
  const [searchParams, setSearchParams] = useSearchParams();
  const outcome = billingOutcome(searchParams.get('billing'));

  // Gestione dell'errore generico: se il fetcher fallisce del tutto (es. network),
  // mostra un banner critico con messaggio generico.
  const [fetcherError, setFetcherError] = useState<string | null>(null);

  // Rilegge i dati della pagina senza ricaricare il documento. Ricaricarlo
  // significherebbe ripetere la richiesta della URL corrente del riquadro, che
  // non e' detto sia una pagina: e' cosi' che dopo un passaggio al piano
  // gratuito compariva una risposta grezza al posto della tab.
  const revalidator = useRevalidator();

  // Quando arriva confirmationUrl, naviga la finestra contenitore (uscita dall'iframe).
  // App Bridge intercetta open(..., '_top') e naviga il parent.
  useEffect(() => {
    if (fetcher.data && 'confirmationUrl' in fetcher.data) {
      window.open(fetcher.data.confirmationUrl, '_top');
    }
  }, [fetcher.data]);

  // Quando il fetcher completa, azzera lo stato di sottomissione.
  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data) {
      setSubmittingPlan(null);
      // Se la risposta è { ok: true }, rilegge i dati della pagina: il piano
      // attuale è cambiato e le card devono rifletterlo.
      if ('ok' in fetcher.data && fetcher.data.ok) {
        revalidator.revalidate();
      }
      // Se c'è un errore nella risposta, lo mostra (il banner è renderizzato sotto).
      if ('error' in fetcher.data) {
        setFetcherError(fetcher.data.error);
      }
    }
    // revalidator fuori dalle dipendenze di proposito: revalidate() ne cambia lo
    // stato, e averlo qui rifarebbe partire l'effetto all'infinito.
  }, [fetcher.state, fetcher.data]);

  // Sezione non disponibile: pagina vuota, ritorno alla dashboard e avviso rosso.
  // Nessuna card e nessun prezzo, cosi' non si suggerisce un upgrade che non serve.
  if (blocked) {
    return (
      <Page
        fullWidth
        title={t.plan.title}
        backAction={{ url: '/', content: t.common.dashboard }}
      >
        <Banner tone="critical" title={t.plan.blocked.title}>
          <Text as="p">{t.plan.blocked.body}</Text>
        </Banner>
        <Box paddingBlockEnd="800" />
      </Page>
    );
  }

  return (
    <Page
      fullWidth
      title={t.plan.title}
      backAction={{ url: '/', content: t.common.dashboard }}
      secondaryActions={[
        {
          content: t.common.settings,
          icon: SettingsIcon,
          url: '/settings/supabase',
          accessibilityLabel: t.common.settings,
          onAction: settings.start,
          disabled: settings.loading,
          loading: settings.loading,
        },
      ]}
    >
      <BlockStack gap="500">
        {/* Banner di esito dopo il ritorno dal flusso di addebito. */}
        {outcome === 'success' && (
          <Banner
            tone="success"
            title={t.plan.successBanner.title}
            onDismiss={() => {
              setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.delete('billing');
                return next;
              });
            }}
          >
            <Text as="p">{t.plan.successBanner.message}</Text>
          </Banner>
        )}
        {outcome === 'error' && (
          <Banner
            tone="warning"
            title={t.plan.errorBanner.title}
            onDismiss={() => {
              setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.delete('billing');
                return next;
              });
            }}
          >
            <Text as="p">{t.plan.errorBanner.message}</Text>
          </Banner>
        )}

        {/* Errore dalla risposta di /billing/subscribe. */}
        {fetcherError && (
          <Banner
            tone="critical"
            title={t.plan.errorTitle}
            onDismiss={() => setFetcherError(null)}
          >
            <Text as="p">{fetcherError}</Text>
          </Banner>
        )}

        {/* Intestazione informativa: riempie lo spazio sopra la griglia e dice
            cosa NON cambia al cambio di piano (dubbio tipico prima di pagare).
            Copy solo in termini di beneficio per il merchant: nessun riferimento a
            come l'app funziona dietro le quinte. */}
        {/* Condizione riservata, in cima a tutto: e' la prima cosa da sapere
            prima di guardare i prezzi, non una nota a margine da scoprire dopo
            averli gia' letti. Permanente e non chiudibile — resta vera finche'
            la collaborazione dura, e riguarda una cifra che il merchant paga. */}
        {partnerLabel && (
          <Banner tone="info" title={t.plan.reserved.title}>
            <Text as="p">
              {t.plan.reserved.before}
              <Text as="span" fontWeight="semibold">
                {partnerLabel}
              </Text>
              {t.plan.reserved.after}
              {discountIntervals != null
                ? t.plan.reserved.forRenewals(discountIntervals)
                : t.plan.reserved.end}
            </Text>
          </Banner>
        )}

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">
              {t.plan.intro.title}
            </Text>
            <Text as="p" tone="subdued">
              {t.plan.intro.body}
            </Text>
            <Text as="p" tone="subdued">
              {t.plan.intro.keepData}
            </Text>
          </BlockStack>
        </Card>

        {/* Scelta del ciclo di fatturazione. Sta sopra le card perche' cambia
            tutti i prezzi insieme: metterla dentro ciascuna card avrebbe fatto
            credere che si potesse pagare un piano al mese e un altro all'anno. */}
        <InlineStack gap="300" blockAlign="center">
          <ButtonGroup variant="segmented">
            <Button
              pressed={interval === 'monthly'}
              onClick={() => setInterval('monthly')}
            >
              {t.plan.monthly}
            </Button>
            <Button
              pressed={interval === 'yearly'}
              onClick={() => setInterval('yearly')}
            >
              {t.plan.yearly}
            </Button>
          </ButtonGroup>
          {/* Il risparmio dell'annuale va detto, non lasciato da calcolare: e'
              l'unica ragione per sceglierlo, e nessuno moltiplica per dodici. */}
          {interval === 'monthly' && yearlySaving != null && (
            <Text as="span" tone="subdued">
              {t.plan.yearlyHint(formatMoney(yearlySaving, currency, locale))}
            </Text>
          )}
          {interval === 'yearly' && discountIntervals != null && (
            <Text as="span" tone="subdued">
              {t.plan.reservedFor(discountIntervals)}
            </Text>
          )}
        </InlineStack>

        <InlineGrid columns={{ xs: 1, sm: 2, lg: 4 }} gap="400">
          {cards.map((plan) => {
            const isCurrent = plan.name.trim().toLowerCase() === currentPlan;
            const isHighlighted = plan.recommended && highlightRecommended;
            // Prezzo mostrato: listino, oppure quello riservato al partner del
            // negozio. Il calcolo e' lo stesso che /billing/subscribe rifa sul
            // server per l'addebito, cosi' cifra vista e cifra pagata non
            // possono divergere.
            const price = effectivePrice(
              interval === 'yearly' ? plan.priceYearly : plan.priceMonthly,
              interval === 'yearly' ? plan.partnerYearly : plan.partnerMonthly,
              discountIntervals,
            );
            return (
              // Il consigliato non ha uno sfondo diverso (sembrava disabilitato) ma un
              // bordo piu' spesso nello stesso colore del pulsante primario. Polaris non
              // espone bordi sulla Card: outline su un wrapper (non occupa spazio, quindi
              // la card non si restringe) con il raggio della Card. display:grid fa
              // stirare la Card all'altezza della riga, come le altre colonne.
              <div
                key={plan.name}
                className="plan-card"
                style={{
                  borderRadius: 'var(--p-border-radius-300)',
                  outline: isHighlighted
                    ? '2px solid var(--p-color-bg-fill-brand)'
                    : undefined,
                }}
              >
                <Card padding="500">
                  {/* Colonna a tutta altezza con la CTA spinta in fondo. La garanzia
                      vera dell'allineamento e' che tutte le card elencano le stesse 6
                      righe senza andare a capo, quindi hanno la stessa altezza: il
                      flex e' la rete di sicurezza. Polaris non espone un "pin in
                      basso", questi style inline sono l'eccezione gia' adottata per
                      il contenitore del grafico. */}
                  <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <BlockStack gap="500">
                      <BlockStack gap="200">
                        <InlineStack gap="200" blockAlign="center" wrap={false}>
                          <Text as="h2" variant="headingMd">
                            {plan.name}
                          </Text>
                          {isHighlighted && <Badge tone="success">{t.plan.recommended}</Badge>}
                          {isCurrent && <Badge tone="info">{t.plan.currentPlan}</Badge>}
                        </InlineStack>

                        {/* Prezzo, periodo, prezzo pieno barrato e risparmio: tutto
                            su UNA riga. Non e' solo estetica — su righe separate le
                            sole card scontate diventavano piu' alte, e i pulsanti in
                            fondo si sollevavano rispetto a quelli delle altre. */}
                        <InlineStack gap="200" blockAlign="baseline" wrap={false}>
                          <Text as="span" variant="heading3xl">
                            {formatMoney(price.payablePrice, currency, locale)}
                          </Text>
                          <Text as="span" tone="subdued">
                            {interval === 'yearly' ? t.plan.perYear : t.plan.perMonth}
                          </Text>
                          {/* Il prezzo pieno resta in vista: senza, il merchant non
                              ha modo di sapere quanto valga la condizione riservata. */}
                          {price.discountAmount > 0 && (
                            <Text as="span" tone="subdued" textDecorationLine="line-through">
                              {formatMoney(price.listPrice, currency, locale)}
                            </Text>
                          )}
                        </InlineStack>
                        {/* Il badge nasce dal testo, non dalla condizione: cosi'
                            non puo' esistere un badge senza niente dentro, che
                            e' cio' che compariva ai negozi senza partnership —
                            una pillina grigia vuota sotto ogni prezzo. */}
                        {anyDiscount && (
                          // Altezza riservata anche dove il badge non c'e': e'
                          // quella riga a decidere dove comincia l'elenco, e su
                          // card affiancate deve cominciare alla stessa quota.
                          <Box minHeight="20px">
                            {savingLabel(price, currency, locale) && (
                              <InlineStack>
                                <Badge tone="info">
                                  {savingLabel(price, currency, locale) as string}
                                </Badge>
                              </InlineStack>
                            )}
                          </Box>
                        )}
                      </BlockStack>

                      <PlanFeatureList features={plan.features} />
                    </BlockStack>

                    {/* marginBlockStart:auto tiene la CTA in fondo alla colonna anche
                        se il contenuto sopra è più corto. */}
                    <div style={{ marginBlockStart: 'auto', paddingBlockStart: 'var(--p-space-500)' }}>
                      <Button
                        variant={isHighlighted ? 'primary' : undefined}
                        {...planButtonState(plan.name, isCurrent, submittingPlan)}
                        fullWidth
                        onClick={() => {
                          setSubmittingPlan(plan.name);
                          setFetcherError(null); // Azzera eventuali errori precedenti
                          fetcher.submit(
                            { plan: plan.name, interval },
                            { method: 'POST', action: '/billing/subscribe' },
                          );
                        }}
                      >
                        {planButtonLabel(plan.name, isCurrent, t)}
                      </Button>
                    </div>
                  </div>
                </Card>
              </div>
            );
          })}
        </InlineGrid>

        <Text as="p" tone="subdued" variant="bodySm" alignment="center">
          {t.plan.billedByShopify}
        </Text>
      </BlockStack>

      {/* Respiro in fondo, come le altre tab. */}
      <Box paddingBlockEnd="800" />
    </Page>
  );
}
