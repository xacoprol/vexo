import { prisma } from "@/lib/prisma";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { IntegrationHealthPanel } from "@/components/settings/IntegrationHealthPanel";
import { CensusSuggestionsPanel } from "@/components/settings/CensusSuggestionsPanel";
import { getIntegrationHealth } from "@/lib/integration-health";
import { buildFiscalCensusSuggestions } from "@/lib/fiscal-census-suggestions";

export default async function SettingsPage() {
  const [settings, invoiceSeries, quoteSeries] = await Promise.all([
    prisma.companySettings.findFirst(),
    prisma.invoiceSeries.findMany({ orderBy: { prefix: "asc" } }),
    prisma.quoteSeries.findMany({ orderBy: { prefix: "asc" } }),
  ]);

  if (!settings) {
    return <p>No hay configuración. Ejecuta el seed.</p>;
  }

  const health = getIntegrationHealth();
  const suggestions = await buildFiscalCensusSuggestions(prisma, settings);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ajustes</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Datos del emisor, series e impuestos
        </p>
      </div>
      <IntegrationHealthPanel items={health} />
      <CensusSuggestionsPanel suggestions={suggestions} />
      <SettingsForm
        settings={settings}
        invoiceSeries={invoiceSeries}
        quoteSeries={quoteSeries}
      />
    </div>
  );
}
