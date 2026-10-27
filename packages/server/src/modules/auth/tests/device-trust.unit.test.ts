import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  digestDeviceToken,
  generateDeviceToken,
  parseDeviceToken,
  parseLoginChallenge,
  signLoginChallenge,
  verifyLoginChallengeBinding,
} from "../services/crypto/device-token.crypto.js";
import { deviceLabel } from "../services/device-label.js";

const pepperA = "device-pepper-a-0123456789abcdef0123456789";
const pepperB = "device-pepper-b-0123456789abcdef0123456789";

test("SEC-02 E4: the User-Agent becomes a short « Navigateur · Système » label", () => {
  const cases: Array<[string | null, string]> = [
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", "Chrome · Windows"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0", "Edge · Windows"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15", "Safari · macOS"],
    ["Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0", "Firefox · Linux"],
    ["Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36", "Chrome · Android"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", "Safari · iOS"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1", "Chrome · iOS"],
    ["Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/131.0 Mobile/15E148 Safari/605.1.15", "Firefox · iOS"],
    ["curl/8.9.1", "Autre · Autre"],
    [null, "Autre · Autre"],
  ];
  for (const [userAgent, label] of cases) assert.equal(deviceLabel(userAgent), label, userAgent ?? "null");
});

test("SEC-02 E2: the device hash is keyed by the pepper", () => {
  const token = generateDeviceToken();
  assert.equal(digestDeviceToken(token, pepperA), digestDeviceToken(token, pepperA));
  assert.notEqual(digestDeviceToken(token, pepperA), digestDeviceToken(token, pepperB));
  assert.notEqual(digestDeviceToken(token, pepperA), digestDeviceToken(generateDeviceToken(), pepperA));
  assert.equal(digestDeviceToken(token, pepperA).includes(token), false);
});

test("SEC-02 E2: a malformed device cookie is treated as absent", () => {
  const token = generateDeviceToken();
  assert.equal(token.length, 43);
  assert.equal(parseDeviceToken(token), token);
  for (const bad of [undefined, "", "short", `${token}x`, `${token.slice(0, 42)}=`, `${token.slice(0, 42)}+`]) {
    assert.equal(parseDeviceToken(bad), null, String(bad));
  }
});

test("SEC-02 E3: the challenge id binds the OTP row to its user and device, and its resend count cannot be edited", () => {
  const binding = { userId: randomUUID(), deviceHash: digestDeviceToken(generateDeviceToken(), pepperA) };
  const challengeId = randomUUID();
  const signed = signLoginChallenge({ challengeId, resends: 1, ...binding }, pepperA);
  const claims = parseLoginChallenge(signed);
  assert.deepEqual(claims && { challengeId: claims.challengeId, resends: claims.resends }, { challengeId, resends: 1 });
  assert.equal(verifyLoginChallengeBinding(claims!, binding, pepperA), true);

  assert.equal(verifyLoginChallengeBinding(claims!, { ...binding, deviceHash: digestDeviceToken(generateDeviceToken(), pepperA) }, pepperA), false, "other device");
  assert.equal(verifyLoginChallengeBinding(claims!, { ...binding, userId: randomUUID() }, pepperA), false, "other user");
  assert.equal(verifyLoginChallengeBinding(claims!, binding, pepperB), false, "other pepper");
  assert.equal(verifyLoginChallengeBinding({ ...claims!, resends: 0 }, binding, pepperA), false, "edited resend count");

  for (const bad of ["", challengeId, `${challengeId}.1`, `not-a-uuid.1.mac`, `${challengeId}.x.mac`, `${signed}.extra`]) {
    assert.equal(parseLoginChallenge(bad), null, bad);
  }
});
