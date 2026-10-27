import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateDeliverability,
  normalizeComponentInput,
  normalizeRulesInput,
  normalizeVariantInput,
  type DeliverabilityInput,
} from "../services/catalogue-content.policy.js";
import { kfitInitialCatalogueSeed } from "../../../db/seeds/catalogue.seed-data.js";
import {
  effectiveMedicalPolicy,
  medicalAlwaysRequired,
  resolveEffectivePolicy,
} from "../../onboarding/services/onboarding.service.js";

const variantId = "22000000-0000-4000-8000-000000000001";
const rules = {
  followUpFrequencyDays: 7,
  lateCancelNoticeHours: 24,
  lateCancelConsumesComponent: true,
  missedConsumesComponent: false,
  medicalClearancePolicy: "required",
};

test("CAT-03 variant input: name and slug on create, closed statuses, duration as a pair, no archive by status (D1)", () => {
  assert.deepEqual(
    normalizeVariantInput(
      {
        name: " Premium ",
        slug: "premium",
        priceXaf: 90000,
        durationValue: 3,
        durationUnit: "month",
      },
      "create",
    ),
    {
      name: "Premium",
      slug: "premium",
      priceXaf: 90000,
      durationValue: 3,
      durationUnit: "month",
      capacityLimit: null,
      availabilityStatus: "open",
      sortOrder: 0,
    },
  );
  for (const [input, reason] of [
    [{ slug: "x" }, "name_invalid"],
    [{ name: "X", slug: "Bad Slug" }, "slug_invalid"],
    [{ name: "X", slug: "x", priceXaf: -1 }, "price_invalid"],
    [{ name: "X", slug: "x", durationValue: 3 }, "duration_pair_invalid"],
    [{ name: "X", slug: "x", capacityLimit: 0 }, "capacity_limit_invalid"],
    [
      { name: "X", slug: "x", availabilityStatus: "archived" },
      "availability_invalid",
    ],
    [{ name: "X", slug: "x", archivedAt: null }, "unknown_field"],
  ] as const)
    assert.deepEqual(
      normalizeVariantInput(input, "create"),
      { invalid: reason },
      reason,
    );
  assert.deepEqual(normalizeVariantInput({ priceXaf: null }, "update"), {
    priceXaf: null,
  });
  assert.deepEqual(normalizeVariantInput({}, "update"), {
    invalid: "empty_patch",
  });
});

test("CAT-03 component input: closed type and consumption vocabularies, positive quantity, scope fixed after creation (D2)", () => {
  assert.deepEqual(
    normalizeComponentInput(
      { componentType: "appointment", label: " Séance ", quantity: 4 },
      "create",
    ),
    {
      variantId: null,
      componentType: "appointment",
      label: "Séance",
      quantity: 4,
      isMandatory: true,
      consumptionPolicy: "manual",
    },
  );
  assert.deepEqual(
    normalizeComponentInput(
      {
        variantId,
        componentType: "program",
        label: "Plan",
        quantity: 1,
        isMandatory: false,
      },
      "create",
    ),
    {
      variantId,
      componentType: "program",
      label: "Plan",
      quantity: 1,
      isMandatory: false,
      consumptionPolicy: "manual",
    },
  );
  for (const [input, mode, reason] of [
    [
      { componentType: "massage", label: "X", quantity: 1 },
      "create",
      "component_type_invalid",
    ],
    [
      { componentType: "program", label: "X", quantity: 0 },
      "create",
      "quantity_invalid",
    ],
    [
      {
        componentType: "program",
        label: "X",
        quantity: 1,
        consumptionPolicy: "auto",
      },
      "create",
      "consumption_policy_invalid",
    ],
    [{ variantId }, "update", "scope_not_editable"],
    [
      { componentType: "program", label: "X", quantity: 1, variantId: "nope" },
      "create",
      "variant_id_invalid",
    ],
  ] as const)
    assert.deepEqual(
      normalizeComponentInput(input, mode),
      { invalid: reason },
      reason,
    );
});

test("CAT-03 rules input: full replacement, bounds 1-90 days and 1-168 hours, medical explicit at offer level only (D3, D4)", () => {
  assert.deepEqual(normalizeRulesInput(rules, "service"), rules);
  assert.deepEqual(
    normalizeRulesInput(
      { ...rules, followUpFrequencyDays: null, lateCancelNoticeHours: null },
      "service",
    ),
    { ...rules, followUpFrequencyDays: null, lateCancelNoticeHours: null },
  );
  assert.deepEqual(
    normalizeRulesInput({ ...rules, medicalClearancePolicy: null }, "variant"),
    { ...rules, medicalClearancePolicy: null },
  );
  for (const [input, reason] of [
    [{ ...rules, followUpFrequencyDays: 0 }, "follow_up_frequency_invalid"],
    [{ ...rules, followUpFrequencyDays: 91 }, "follow_up_frequency_invalid"],
    [{ ...rules, lateCancelNoticeHours: 169 }, "late_cancel_notice_invalid"],
    [{ ...rules, medicalClearancePolicy: null }, "medical_policy_invalid"],
    [
      { ...rules, medicalClearancePolicy: "sometimes" },
      "medical_policy_invalid",
    ],
    [{ ...rules, questionnaireTemplateId: null }, "unknown_field"],
    [{ followUpFrequencyDays: 7 }, "rules_incomplete"],
    [{ ...rules, missedConsumesComponent: "yes" }, "consumption_flag_invalid"],
  ] as const)
    assert.deepEqual(
      normalizeRulesInput(input, "service"),
      { invalid: reason },
      reason,
    );
});

test("CAT-03 medical « required » is a valid policy and the variant value wins (D4)", () => {
  const rows = [
    {
      variantId: null,
      questionnaireTemplateId: null,
      medicalClearancePolicy: "required",
    },
    {
      variantId,
      questionnaireTemplateId: null,
      medicalClearancePolicy: "not_required",
    },
  ];
  assert.equal(resolveEffectivePolicy(rows, null).status, "ok");
  assert.equal(effectiveMedicalPolicy(rows, null), "required");
  assert.equal(effectiveMedicalPolicy(rows, variantId), "not_required");
  assert.equal(
    effectiveMedicalPolicy(
      [{ variantId, medicalClearancePolicy: null }, rows[0]!],
      variantId,
    ),
    "required",
  );
  assert.equal(medicalAlwaysRequired("required"), true);
  assert.equal(medicalAlwaysRequired("required_if_risk_flag"), false);
  assert.deepEqual(
    resolveEffectivePolicy(
      [
        {
          variantId: null,
          questionnaireTemplateId: null,
          medicalClearancePolicy: "sometimes",
        },
      ],
      null,
    ),
    { status: "policy_invalid" },
  );
});

const deliverable: DeliverabilityInput = {
  service: {
    pricingMode: "fixed",
    basePriceXaf: null,
    deliveryType: "time_based",
    defaultDurationValue: 12,
    defaultDurationUnit: "week",
  },
  variants: [
    { id: "v1", priceXaf: 50000, durationValue: null, durationUnit: null },
    { id: "v2", priceXaf: 90000, durationValue: 3, durationUnit: "month" },
  ],
  components: [{ variantId: "v1" }, { variantId: "v2" }],
  serviceRules: { medicalClearancePolicy: "not_required" },
};
test("CAT-03 deliverability passes a complete offer and names each failed rule (D6)", () => {
  assert.deepEqual(evaluateDeliverability(deliverable), []);
  assert.deepEqual(
    evaluateDeliverability({
      ...deliverable,
      components: [{ variantId: "v1" }],
    }),
    [{ rule: "variant_component_missing", variantId: "v2" }],
  );
  assert.deepEqual(
    evaluateDeliverability({
      ...deliverable,
      components: [{ variantId: null }],
    }),
    [],
    "a service-level component reaches every variant",
  );
  assert.deepEqual(
    evaluateDeliverability({
      ...deliverable,
      variants: [],
      components: [{ variantId: "v1" }],
    }),
    [
      { rule: "service_component_missing", variantId: null },
      { rule: "price_missing", variantId: null },
    ],
  );
  assert.deepEqual(
    evaluateDeliverability({ ...deliverable, serviceRules: null }),
    [{ rule: "service_rules_missing", variantId: null }],
  );
  assert.deepEqual(
    evaluateDeliverability({
      ...deliverable,
      serviceRules: { medicalClearancePolicy: null },
    }),
    [{ rule: "medical_policy_missing", variantId: null }],
  );
  assert.deepEqual(
    evaluateDeliverability({
      ...deliverable,
      variants: [
        { ...deliverable.variants[0]!, priceXaf: null },
        deliverable.variants[1]!,
      ],
    }),
    [{ rule: "price_missing", variantId: "v1" }],
  );
  assert.deepEqual(
    evaluateDeliverability({
      ...deliverable,
      service: { ...deliverable.service, basePriceXaf: 40000 },
      variants: [
        { ...deliverable.variants[0]!, priceXaf: null },
        deliverable.variants[1]!,
      ],
    }),
    [],
  );
  assert.deepEqual(
    evaluateDeliverability({
      ...deliverable,
      service: {
        ...deliverable.service,
        defaultDurationValue: null,
        defaultDurationUnit: null,
      },
    }),
    [{ rule: "duration_missing", variantId: "v1" }],
  );
});

test("CAT-03 every seeded offer is deliverable, including the amended « Programme sportif » rules row (D6)", () => {
  const seed = kfitInitialCatalogueSeed;
  for (const service of seed.services) {
    const rulesRow = seed.policies.find(
      (p) => p.serviceId === service.id && p.variantId === null,
    );
    const failures = evaluateDeliverability({
      service: {
        pricingMode: service.pricingMode,
        basePriceXaf: service.basePriceXaf,
        deliveryType: service.deliveryType,
        defaultDurationValue: service.defaultDurationValue,
        defaultDurationUnit: service.defaultDurationUnit,
      },
      variants: seed.variants
        .filter((v) => v.serviceId === service.id)
        .map((v) => ({
          id: v.id,
          priceXaf: v.priceXaf,
          durationValue: v.durationValue,
          durationUnit: v.durationUnit,
        })),
      components: seed.components
        .filter((c) => c.serviceId === service.id)
        .map((c) => ({ variantId: c.variantId })),
      serviceRules: rulesRow
        ? { medicalClearancePolicy: rulesRow.medicalClearancePolicy }
        : null,
    });
    assert.deepEqual(failures, [], service.name);
  }
});

test("CAT-03 deliverability: quote and one-time offers need no price or duration (D6)", () => {
  const bilan: DeliverabilityInput = {
    service: {
      pricingMode: "quote",
      basePriceXaf: null,
      deliveryType: "one_time",
      defaultDurationValue: null,
      defaultDurationUnit: null,
    },
    variants: [],
    components: [{ variantId: null }],
    serviceRules: { medicalClearancePolicy: "not_required" },
  };
  assert.deepEqual(evaluateDeliverability(bilan), []);
});
