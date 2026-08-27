/**
 * Capacidad AEAT por modelo (Fase 16).
 * Fuentes: Sede AEAT — ver docs/fiscal/aeat-submission.md
 */

import type { DeclarationModelCode } from "@/lib/fiscal-declaration/types";

export type AeatChannelCapability =
  | "DIRECT_API_SUPPORTED"
  | "FILE_IMPORT_SUPPORTED"
  | "ASSISTED_WEB_ONLY"
  | "UNKNOWN"
  | "BLOCKED";

export type VexoSubmissionStrategy =
  | "AUTOMATIC"
  | "FILE_EXPORT"
  | "ASSISTED";

export type AeatModelCapability = {
  model: DeclarationModelCode;
  capability: AeatChannelCapability;
  strategy: VexoSubmissionStrategy;
  hasPublicApi: boolean;
  hasOfficialFileDesign: boolean;
  hasWebForm: boolean;
  auth: string;
  nrcWhenPayable: boolean;
  sedePathHint: string;
  officialSources: string[];
  notes: string;
};

/** Deep-links estables a procedimientos de la Sede (páginas de ayuda / inicio). */
export const AEAT_SEDE_LINKS: Record<DeclarationModelCode, string> = {
  "130":
    "https://sede.agenciatributaria.gob.es/Sede/ayuda/consultas-informaticas/presentacion-declaraciones-ayuda-tecnica/modelo-130/presentacion-electronica-modelo-130.html",
  "303": "https://sede.agenciatributaria.gob.es/Sede/iva/pre-303.html",
  "349": "https://sede.agenciatributaria.gob.es/Sede/procedimientoini/GI28.shtml",
  "111":
    "https://sede.agenciatributaria.gob.es/Sede/ayuda/consultas-informaticas/presentacion-declaraciones-ayuda-tecnica/modelo-111/presentacion-electronica-modelo-111.html",
  "115":
    "https://sede.agenciatributaria.gob.es/Sede/ayuda/consultas-informaticas/presentacion-declaraciones-ayuda-tecnica/modelo-115/presentacion-electronica-modelo-115.html",
};

export const AEAT_CAPABILITY_MATRIX: Record<
  DeclarationModelCode,
  AeatModelCapability
> = {
  "130": {
    model: "130",
    capability: "FILE_IMPORT_SUPPORTED",
    strategy: "ASSISTED",
    hasPublicApi: false,
    hasOfficialFileDesign: true,
    hasWebForm: true,
    auth: "Cl@ve / certificado / DNIe; apoderado o colaborador social",
    nrcWhenPayable: true,
    sedePathHint: AEAT_SEDE_LINKS["130"],
    officialSources: [
      "https://sede.agenciatributaria.gob.es/Sede/ayuda/consultas-informaticas/presentacion-declaraciones-ayuda-tecnica/modelo-130/presentacion-electronica-modelo-130.html",
      "https://sede.agenciatributaria.gob.es/static_files/Sede/Disenyo_registro/ant_100_199/archivos/dr130.08.pdf",
    ],
    notes:
      "Formulario Sede + import diseño registro .130. Sin WS público. Serializer BOE exacto no implementado (evitar aproximaciones).",
  },
  "303": {
    model: "303",
    capability: "FILE_IMPORT_SUPPORTED",
    strategy: "ASSISTED",
    hasPublicApi: false,
    hasOfficialFileDesign: true,
    hasWebForm: true,
    auth: "Cl@ve / certificado / DNIe",
    nrcWhenPayable: true,
    sedePathHint: AEAT_SEDE_LINKS["303"],
    officialSources: [
      "https://sede.agenciatributaria.gob.es/Sede/iva/pre-303.html",
      "https://sede.agenciatributaria.gob.es/Sede/ayuda/consultas-informaticas/presentacion-declaraciones-ayuda-tecnica/modelo-303.html",
    ],
    notes: "Pre303 + form/fichero. Sin API pública. NRC si a ingresar.",
  },
  "349": {
    model: "349",
    capability: "FILE_IMPORT_SUPPORTED",
    strategy: "ASSISTED",
    hasPublicApi: false,
    hasOfficialFileDesign: true,
    hasWebForm: true,
    auth: "Certificado / Cl@ve / colaborador",
    nrcWhenPayable: false,
    sedePathHint: AEAT_SEDE_LINKS["349"],
    officialSources: [
      "https://sede.agenciatributaria.gob.es/Sede/procedimientoini/GI28.shtml",
      "https://sede.agenciatributaria.gob.es/Sede/ayuda/consultas-informaticas/declaraciones-informativas-ayuda-tecnica/modelos-349-720/modelo-349-presentacion-mediante-fichero.html",
      "https://sede.agenciatributaria.gob.es/static_files/Sede/Disenyo_registro/DR_300_399/archivos_20/DR_Anexo_349.pdf",
    ],
    notes:
      "TGVI online + diseño registro. Serializer exacto pendiente — no export aproximado.",
  },
  "111": {
    model: "111",
    capability: "ASSISTED_WEB_ONLY",
    strategy: "ASSISTED",
    hasPublicApi: false,
    hasOfficialFileDesign: true,
    hasWebForm: true,
    auth: "Cl@ve / certificado",
    nrcWhenPayable: true,
    sedePathHint: AEAT_SEDE_LINKS["111"],
    officialSources: [
      "https://sede.agenciatributaria.gob.es/Sede/ayuda/consultas-informaticas/presentacion-declaraciones-ayuda-tecnica/modelo-111/presentacion-electronica-modelo-111.html",
    ],
    notes: "Formulario Sede. NRC si a ingresar.",
  },
  "115": {
    model: "115",
    capability: "ASSISTED_WEB_ONLY",
    strategy: "ASSISTED",
    hasPublicApi: false,
    hasOfficialFileDesign: true,
    hasWebForm: true,
    auth: "Cl@ve / certificado",
    nrcWhenPayable: true,
    sedePathHint: AEAT_SEDE_LINKS["115"],
    officialSources: [
      "https://sede.agenciatributaria.gob.es/Sede/ayuda/consultas-informaticas/presentacion-declaraciones-ayuda-tecnica/modelo-115/presentacion-electronica-modelo-115.html",
    ],
    notes: "Formulario Sede. NRC si a ingresar.",
  },
};

export function getAeatCapability(
  model: DeclarationModelCode
): AeatModelCapability {
  return AEAT_CAPABILITY_MATRIX[model];
}
