import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express, { type Express, type Request } from "express";
import {
  parseTrustedProxyIp,
  productionTrustProxy,
  TRUSTED_PROXY_IP_ENV,
  TrustedProxyConfigError,
} from "./trusted-proxy.js";

const GATEWAY = "10.247.13.1";
const productionApp = (gateway: string | undefined = GATEWAY) => {
  const app = express();
  app.set(
    "trust proxy",
    productionTrustProxy({ [TRUSTED_PROXY_IP_ENV]: gateway }),
  );
  app.get("/ip", (req, res) => {
    res.json({ ip: req.ip });
  });
  return app;
};

/** req.ip as Express resolves it for a connection from `socketAddress` carrying `forwardedFor`. */
const resolvedIp = (
  app: Express,
  socketAddress: string,
  forwardedFor?: string,
) => {
  const req = Object.create(app.request) as Request;
  const socket = { remoteAddress: socketAddress };
  Object.assign(req, {
    socket,
    connection: socket,
    headers: forwardedFor ? { "x-forwarded-for": forwardedFor } : {},
  });
  return req.ip;
};

test("S9A.3: the trusted proxy setting accepts one canonical private IPv4 gateway only", () => {
  assert.equal(parseTrustedProxyIp(GATEWAY), GATEWAY);
  assert.equal(parseTrustedProxyIp(` ${GATEWAY} `), GATEWAY);
  assert.equal(parseTrustedProxyIp("172.31.250.1"), "172.31.250.1");
  assert.equal(parseTrustedProxyIp("192.168.77.1"), "192.168.77.1");
  for (const malformed of [
    undefined,
    "",
    "loopback",
    "true",
    "1",
    "10.247.13.0/24",
    "10.247.13.1,10.247.13.2",
    "10.247.13.1 10.247.13.2",
    "010.247.13.1",
    "10.247.13",
    "10.247.13.256",
    "10.247.13.0",
    "10.247.13.255",
    "127.0.0.1",
    "0.0.0.0",
    "8.8.8.8",
    "172.32.0.1",
    "::1",
    "fd00::1",
    "::ffff:10.247.13.1",
  ])
    assert.equal(parseTrustedProxyIp(malformed), null, String(malformed));
});

test("S9A.3: production refuses to build its proxy trust from a missing or malformed gateway", () => {
  for (const value of [undefined, "", "10.0.0.0/8", "203.0.113.1"])
    assert.throws(
      () => productionTrustProxy({ [TRUSTED_PROXY_IP_ENV]: value }),
      (error) =>
        error instanceof TrustedProxyConfigError &&
        error.code === "TRUSTED_PROXY_INVALID",
      String(value),
    );
  assert.deepEqual(productionTrustProxy({ [TRUSTED_PROXY_IP_ENV]: GATEWAY }), [
    "loopback",
    GATEWAY,
  ]);
});

test("S9A.3: Express trusts loopback and the configured gateway, nothing else", () => {
  const trusts = productionApp().get("trust proxy fn") as (
    address: string,
    hop: number,
  ) => boolean;
  for (const address of ["127.0.0.1", "127.0.0.2", "::1", GATEWAY])
    assert.equal(trusts(address, 0), true, address);
  for (const address of [
    "172.17.0.1",
    "10.247.13.2",
    "10.0.0.1",
    "192.168.1.10",
    "172.20.0.1",
    "203.0.113.7",
    "8.8.8.8",
  ])
    assert.equal(trusts(address, 0), false, address);
});

test("S9A.3: req.ip is the client nginx saw, from loopback or the gateway; spoofed hops and other sources are not trusted", () => {
  const app = productionApp();
  // nginx appends the real peer ($proxy_add_x_forwarded_for); whatever the client sent sits to its left.
  const spoofed = "198.51.100.66, 203.0.113.9";
  assert.equal(resolvedIp(app, GATEWAY, spoofed), "203.0.113.9");
  assert.equal(resolvedIp(app, "127.0.0.1", spoofed), "203.0.113.9");
  // A client naming loopback or the gateway itself as an earlier hop cannot step past its own address.
  assert.equal(
    resolvedIp(
      app,
      GATEWAY,
      `198.51.100.66, ${GATEWAY}, 127.0.0.1, 203.0.113.9`,
    ),
    "203.0.113.9",
  );
  assert.equal(resolvedIp(app, GATEWAY), GATEWAY);
  // Untrusted peers: their X-Forwarded-For is ignored, the peer itself is the client.
  assert.equal(resolvedIp(app, "172.17.0.1", "203.0.113.9"), "172.17.0.1");
  assert.equal(resolvedIp(app, "10.247.13.2", "203.0.113.9"), "10.247.13.2");
  assert.equal(resolvedIp(app, "192.168.1.10", "203.0.113.9"), "192.168.1.10");
  assert.equal(
    resolvedIp(app, "203.0.113.50", "198.51.100.66"),
    "203.0.113.50",
  );
});

test("S9A.3: over a real HTTP hop from loopback, Express reports the rightmost client address", async () => {
  const server = createServer(productionApp());
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const { port } = server.address() as AddressInfo;
    const ip = async (forwardedFor?: string) => {
      const response = await fetch(`http://127.0.0.1:${port}/ip`, {
        headers: forwardedFor ? { "x-forwarded-for": forwardedFor } : {},
      });
      return ((await response.json()) as { ip: string }).ip;
    };
    assert.equal(await ip("198.51.100.66, 203.0.113.9"), "203.0.113.9");
    assert.equal(await ip("203.0.113.9"), "203.0.113.9");
    assert.equal(await ip(), "127.0.0.1");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
