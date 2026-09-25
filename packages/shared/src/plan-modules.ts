import {
  BUILTIN_MODEL_PROVIDER_IDS,
  type BuiltinModelProviderId,
} from "./model-provider-types.js";

export type PlanModuleLifecycle =
  | "enabled"
  | "catalog-disabled"
  | "runtime-disabled"
  | "retired";

export const PLAN_MODULE_IDS = {
  zaiStartPlan: "zai-start-plan",
  zaiIndividualCodingPlan: "zai-individual-coding-plan",
  zaiTeamCodingPlan: "zai-team-coding-plan",
  bigmodelStartPlan: "bigmodel-start-plan",
  bigmodelIndividualCodingPlan: "bigmodel-individual-coding-plan",
  bigmodelTeamCodingPlan: "bigmodel-team-coding-plan",
} as const;

export type PlanModuleId = (typeof PLAN_MODULE_IDS)[keyof typeof PLAN_MODULE_IDS];

const PLAN_MODULE_ID_BY_PROVIDER_ID: Readonly<Record<BuiltinModelProviderId, PlanModuleId>> = {
  [BUILTIN_MODEL_PROVIDER_IDS.zaiStartPlan]: PLAN_MODULE_IDS.zaiStartPlan,
  [BUILTIN_MODEL_PROVIDER_IDS.zaiIndividualCodingPlan]: PLAN_MODULE_IDS.zaiIndividualCodingPlan,
  [BUILTIN_MODEL_PROVIDER_IDS.zaiTeamCodingPlan]: PLAN_MODULE_IDS.zaiTeamCodingPlan,
  [BUILTIN_MODEL_PROVIDER_IDS.bigmodelStartPlan]: PLAN_MODULE_IDS.bigmodelStartPlan,
  [BUILTIN_MODEL_PROVIDER_IDS.bigmodelIndividualCodingPlan]:
    PLAN_MODULE_IDS.bigmodelIndividualCodingPlan,
  [BUILTIN_MODEL_PROVIDER_IDS.bigmodelTeamCodingPlan]: PLAN_MODULE_IDS.bigmodelTeamCodingPlan,
};

export function resolvePlanModuleIdByProviderId(providerId: string): PlanModuleId | null {
  return PLAN_MODULE_ID_BY_PROVIDER_ID[providerId as BuiltinModelProviderId] ?? null;
}

export function getBuiltinPlanModuleIds(): readonly PlanModuleId[] {
  return Object.freeze(Object.values(PLAN_MODULE_IDS));
}
