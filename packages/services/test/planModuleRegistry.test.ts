import assert from "node:assert/strict";
import test from "node:test";
import {
  BUILTIN_MODEL_PROVIDER_IDS,
  PLAN_MODULE_IDS,
  getBuiltinPlanModuleIds,
  resolvePlanModuleIdByProviderId,
} from "@zcode/shared";
import {
  createPlanModuleRegistry,
  isPlanModuleCatalogEnabledForProvider,
} from "../src/coding-plan-subscription/planModuleRegistry.js";

test("default registry enables every built-in plan module", () => {
  const registry = createPlanModuleRegistry();

  for (const moduleId of getBuiltinPlanModuleIds()) {
    assert.equal(registry.isRegistered(moduleId), true);
    assert.equal(registry.getLifecycle(moduleId), "enabled");
    assert.equal(registry.isEnabled(moduleId), true);
    assert.equal(registry.isCatalogEnabled(moduleId), true);
    assert.equal(registry.isRuntimeEnabled(moduleId), true);
  }
});

test("lifecycle overrides are isolated to the selected module", () => {
  const registry = createPlanModuleRegistry({
    lifecycles: {
      [PLAN_MODULE_IDS.zaiStartPlan]: "catalog-disabled",
      [PLAN_MODULE_IDS.bigmodelStartPlan]: "runtime-disabled",
      [PLAN_MODULE_IDS.zaiTeamCodingPlan]: "retired",
    },
  });

  assert.equal(registry.getLifecycle(PLAN_MODULE_IDS.zaiStartPlan), "catalog-disabled");
  assert.equal(registry.isEnabled(PLAN_MODULE_IDS.zaiStartPlan), false);
  assert.equal(registry.isCatalogEnabled(PLAN_MODULE_IDS.zaiStartPlan), false);
  assert.equal(registry.isRuntimeEnabled(PLAN_MODULE_IDS.zaiStartPlan), true);

  assert.equal(registry.getLifecycle(PLAN_MODULE_IDS.bigmodelStartPlan), "runtime-disabled");
  assert.equal(registry.isCatalogEnabled(PLAN_MODULE_IDS.bigmodelStartPlan), false);
  assert.equal(registry.isRuntimeEnabled(PLAN_MODULE_IDS.bigmodelStartPlan), false);

  assert.equal(registry.getLifecycle(PLAN_MODULE_IDS.zaiTeamCodingPlan), "retired");
  assert.equal(registry.isCatalogEnabled(PLAN_MODULE_IDS.zaiTeamCodingPlan), false);
  assert.equal(registry.isRuntimeEnabled(PLAN_MODULE_IDS.zaiTeamCodingPlan), false);

  assert.equal(registry.getLifecycle(PLAN_MODULE_IDS.bigmodelIndividualCodingPlan), "enabled");
});

test("unknown modules fail closed", () => {
  const registry = createPlanModuleRegistry();

  assert.equal(registry.isRegistered("in-house"), false);
  assert.equal(registry.getLifecycle("in-house"), null);
  assert.equal(registry.isEnabled("in-house"), false);
  assert.equal(registry.isCatalogEnabled("in-house"), false);
  assert.equal(registry.isRuntimeEnabled("in-house"), false);
});

test("provider IDs resolve through an explicit module mapping", () => {
  assert.equal(
    resolvePlanModuleIdByProviderId(BUILTIN_MODEL_PROVIDER_IDS.zaiStartPlan),
    PLAN_MODULE_IDS.zaiStartPlan,
  );
  assert.equal(
    resolvePlanModuleIdByProviderId(BUILTIN_MODEL_PROVIDER_IDS.zaiIndividualCodingPlan),
    PLAN_MODULE_IDS.zaiIndividualCodingPlan,
  );
  assert.equal(
    resolvePlanModuleIdByProviderId(BUILTIN_MODEL_PROVIDER_IDS.zaiTeamCodingPlan),
    PLAN_MODULE_IDS.zaiTeamCodingPlan,
  );
  assert.equal(
    resolvePlanModuleIdByProviderId(BUILTIN_MODEL_PROVIDER_IDS.bigmodelStartPlan),
    PLAN_MODULE_IDS.bigmodelStartPlan,
  );
  assert.equal(
    resolvePlanModuleIdByProviderId(BUILTIN_MODEL_PROVIDER_IDS.bigmodelIndividualCodingPlan),
    PLAN_MODULE_IDS.bigmodelIndividualCodingPlan,
  );
  assert.equal(
    resolvePlanModuleIdByProviderId(BUILTIN_MODEL_PROVIDER_IDS.bigmodelTeamCodingPlan),
    PLAN_MODULE_IDS.bigmodelTeamCodingPlan,
  );
  assert.equal(resolvePlanModuleIdByProviderId("openai-api"), null);
});

test("registry does not retain a mutable lifecycle options object", () => {
  const lifecycles = { [PLAN_MODULE_IDS.zaiStartPlan]: "catalog-disabled" as const };
  const registry = createPlanModuleRegistry({ lifecycles });

  lifecycles[PLAN_MODULE_IDS.zaiStartPlan] = "retired";
  assert.equal(registry.getLifecycle(PLAN_MODULE_IDS.zaiStartPlan), "catalog-disabled");

  const { isRuntimeEnabled } = registry;
  assert.equal(isRuntimeEnabled(PLAN_MODULE_IDS.zaiStartPlan), true);
});

test("catalog gate closes only the targeted module", () => {
  const registry = createPlanModuleRegistry({
    lifecycles: {
      [PLAN_MODULE_IDS.bigmodelStartPlan]: "catalog-disabled",
    },
  });

  // 关闭 bigmodel Start：自身被拒；Z.ai Start 与两家个人/团队套餐不受影响。
  assert.equal(
    isPlanModuleCatalogEnabledForProvider(registry, BUILTIN_MODEL_PROVIDER_IDS.bigmodelStartPlan),
    false,
  );
  assert.equal(
    isPlanModuleCatalogEnabledForProvider(registry, BUILTIN_MODEL_PROVIDER_IDS.zaiStartPlan),
    true,
  );
  assert.equal(
    isPlanModuleCatalogEnabledForProvider(
      registry,
      BUILTIN_MODEL_PROVIDER_IDS.bigmodelIndividualCodingPlan,
    ),
    true,
  );
  assert.equal(
    isPlanModuleCatalogEnabledForProvider(
      registry,
      BUILTIN_MODEL_PROVIDER_IDS.zaiIndividualCodingPlan,
    ),
    true,
  );
  assert.equal(
    isPlanModuleCatalogEnabledForProvider(
      registry,
      BUILTIN_MODEL_PROVIDER_IDS.bigmodelTeamCodingPlan,
    ),
    true,
  );
});

test("catalog gate treats catalog-disabled, runtime-disabled and retired as closed", () => {
  const registry = createPlanModuleRegistry({
    lifecycles: {
      [PLAN_MODULE_IDS.zaiStartPlan]: "catalog-disabled",
    },
  });
  assert.equal(
    isPlanModuleCatalogEnabledForProvider(registry, BUILTIN_MODEL_PROVIDER_IDS.zaiStartPlan),
    false,
  );

  const runtimeDisabled = createPlanModuleRegistry({
    lifecycles: { [PLAN_MODULE_IDS.zaiStartPlan]: "runtime-disabled" },
  });
  assert.equal(
    isPlanModuleCatalogEnabledForProvider(runtimeDisabled, BUILTIN_MODEL_PROVIDER_IDS.zaiStartPlan),
    false,
  );

  const retired = createPlanModuleRegistry({
    lifecycles: { [PLAN_MODULE_IDS.zaiStartPlan]: "retired" },
  });
  assert.equal(
    isPlanModuleCatalogEnabledForProvider(retired, BUILTIN_MODEL_PROVIDER_IDS.zaiStartPlan),
    false,
  );
});

test("catalog gate bypasses non-plan providers and provider-less calls", () => {
  // 默认注册表全启用；此处同时验证 未知 provider 与 空 providerId 的兼容放行路径。
  const registry = createPlanModuleRegistry();
  assert.equal(isPlanModuleCatalogEnabledForProvider(registry, undefined), true);
  assert.equal(isPlanModuleCatalogEnabledForProvider(registry, "openai-api"), true);
});
