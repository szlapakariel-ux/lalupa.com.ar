import { requirePageUser } from "@/server/auth/require-user";
import { getSettings } from "@/server/services/settings";
import { Card, PageTitle } from "@/components/ui";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  await requirePageUser("ADMIN");
  const settings = await getSettings();

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageTitle title="Configuración" />
      <Card>
        <h2 className="mb-1 font-medium">Reglas de consumo de clases</h2>
        <p className="mb-4 text-sm text-tinta-suave">
          Definí qué estados de asistencia descuentan una clase del pack. Los
          cambios aplican a los registros nuevos; el historial no se modifica.
        </p>
        <SettingsForm
          settings={{
            presentConsumes: settings.presentConsumes,
            earlyCancelConsumes: settings.earlyCancelConsumes,
            lateCancelConsumes: settings.lateCancelConsumes,
            absentConsumes: settings.absentConsumes,
            trialConsumes: settings.trialConsumes,
            earlyCancelHours: settings.earlyCancelHours,
          }}
        />
      </Card>
    </div>
  );
}
