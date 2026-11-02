"use client";

import { buttonClasses } from "@/components/ui/Button";
import { useWizard } from "@/components/wizard/WizardProvider";

// Opens the Add source wizard at the CSV drop zone, preset to import clients.
export function UploadClientsButton() {
  const wizard = useWizard();
  return (
    <button type="button" onClick={() => wizard.open({ mode: "clients" })} className={buttonClasses({ size: "lg", edge: "bright", className: "mt-10 text-[17px]!" })}>
      Upload clients
    </button>
  );
}
