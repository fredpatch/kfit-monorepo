import assert from "node:assert/strict";
import test from "node:test";
import { CustomersService, type CustomersRepository, type NormalizedCustomerInput } from "../services/customers.service.js";

const actor = { userId: "11111111-1111-1111-1111-111111111111", requestId: "customer-test", ipAddress: null, userAgent: null };
function repository(overrides: Partial<CustomersRepository> = {}): CustomersRepository {
  return { async listActive() { return []; }, async searchActive() { return []; }, async createManual() { return { status: "duplicate" }; }, ...overrides };
}

test("customer manual creation trims input, normalizes WhatsApp, defaults channel and ignores caller-owned linkage", async () => {
  let saved: NormalizedCustomerInput | undefined;
  const service = new CustomersService(repository({ async createManual(input, context) { saved = input; assert.equal(context, actor); return { status: "duplicate" }; } }));
  await service.createManual({ fullName: "  Synthetic Customer  ", whatsapp: "+241 00 00 00 00", prospectId: actor.userId, email: " ", city: " Libreville " }, actor);
  assert.deepEqual(saved, { fullName: "Synthetic Customer", whatsapp: "+24100000000", email: null, city: "Libreville", country: null, preferredContactChannel: "whatsapp" });
});

test("customer lookup normalizes before querying and preserves an empty result", async () => {
  const service = new CustomersService(repository({ async searchActive(phone) { assert.equal(phone, "+24100000000"); return []; } }));
  assert.deepEqual(await service.search("+241 00 00 00 00"), { status: "ok", customers: [] });
});

test("invalid search inputs never reach persistence", async () => {
  const service = new CustomersService(repository({ async searchActive() { assert.fail("invalid input reached repository"); } }));
  for (const value of [undefined, null, [], {}, "", "123", "1".repeat(31)]) assert.equal((await service.search(value)).status, "invalid");
});

test("invalid manual customer fields and non-object bodies never reach persistence", async () => {
  const service = new CustomersService(repository({ async createManual() { assert.fail("invalid input reached repository"); } }));
  const valid = { fullName: "Synthetic Customer", whatsapp: "+24100000000" };
  for (const input of [null, [], "text", {}, { ...valid, fullName: " " }, { ...valid, fullName: "x".repeat(201) },
    { ...valid, whatsapp: 123456789 }, { ...valid, email: "invalid" }, { ...valid, email: {} },
    { ...valid, city: 42 }, { ...valid, country: "x".repeat(201) }, { ...valid, preferredContactChannel: null }]) {
    assert.equal((await service.createManual(input, actor)).status, "invalid");
  }
});

test("customer service returns duplicate conflicts and propagates persistence failure", async () => {
  const input = { fullName: "Synthetic Customer", whatsapp: "+24100000000" };
  assert.deepEqual(await new CustomersService(repository()).createManual(input, actor), { status: "duplicate" });
  const service = new CustomersService(repository({ async createManual() { throw new Error("audit failed"); } }));
  await assert.rejects(service.createManual(input, actor), /audit failed/);
});
