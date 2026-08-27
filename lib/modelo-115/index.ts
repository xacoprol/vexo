export * from "@/lib/modelo-115/types";
export {
  resolve115WithholdingPeriod,
  resolveModel115Periodicity,
  parseModel115Periodicity,
  withholdingIn115Period,
} from "@/lib/modelo-115/period";
export {
  collectEffective115Withholdings,
  validate115Landlord,
} from "@/lib/modelo-115/collect";
export {
  assemble115Boxes,
  build115BoxList,
  computeModelo115,
  empty115Boxes,
  to115TraceLine,
} from "@/lib/modelo-115/boxes";
export { resolve115Deadline, MODEL115_DEADLINE_SCOPE_NOTE } from "@/lib/modelo-115/deadlines";
export { assess115FilingObligation } from "@/lib/modelo-115/filing-obligation";
export { buildModel115, type BuildModel115Input } from "@/lib/modelo-115/engine";
export { buildModelo115Draft } from "@/lib/modelo-115/load";
export {
  build115PresentedSnapshot,
  parse115PresentedSnapshot,
  draft115BoxesList,
  draft115ResultAmount,
  outcome115Label,
  compare115PresentedVsDraft,
} from "@/lib/modelo-115/presentation";
