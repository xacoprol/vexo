-- Fase Fiscal 2: configuración explícita estimación directa + Modelo 130 auditable
ALTER TABLE "CompanySettings" ADD COLUMN "irpfDirectEstimationMode" TEXT NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "CompanySettings" ADD COLUMN "previousYearNetIncomeFor130Reduction" DOUBLE PRECISION;
ALTER TABLE "CompanySettings" ADD COLUMN "previousYearNetIncome130Mode" TEXT NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "CompanySettings" ADD COLUMN "irpf130HousingDeduction" TEXT NOT NULL DEFAULT 'NO';
ALTER TABLE "CompanySettings" ADD COLUMN "agriculturalActivities130" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "CompanySettings" ADD COLUMN "irregularIncome130Status" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "CompanySettings" ADD COLUMN "activityKind130" TEXT NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "CompanySettings" ADD COLUMN "priorYearWithholdingPct130" DOUBLE PRECISION;
