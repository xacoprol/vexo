export * from "@/lib/modelo-111/types";
export {
  resolve111WithholdingPeriod,
  resolveModel111Periodicity,
  parseModel111Periodicity,
  withholdingIn111Period,
} from "@/lib/modelo-111/period";
export {
  collectEffective111Withholdings,
  validate111Payee,
} from "@/lib/modelo-111/collect";
export {
  compute111Box28,
  compute111EconomicActivityBoxes,
  assemble111Boxes,
  build111BoxList,
  to111TraceLine,
} from "@/lib/modelo-111/boxes";
export { resolve111Deadline, MODEL111_DEADLINE_SCOPE_NOTE } from "@/lib/modelo-111/deadlines";
export { assess111FilingObligation } from "@/lib/modelo-111/filing-obligation";
export { buildModel111, type BuildModel111Input } from "@/lib/modelo-111/engine";
export { buildModelo111Draft } from "@/lib/modelo-111/load";
export {
  build111PresentedSnapshot,
  parse111PresentedSnapshot,
  draft111BoxesList,
  draft111ResultAmount,
  outcome111Label,
  compare111PresentedVsDraft,
  boxesFromRecord,
} from "@/lib/modelo-111/presentation";
