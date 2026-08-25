const baseUrl = (process.env.AUTH_STAGING_PROXY_URL || "http://127.0.0.1:8080").replace(/\/$/, "");

const cookieNames = { accessToken: "kfit_access", refreshToken: "kfit_refresh", csrfToken: "kfit_csrf" };

function assert(condition, message) { if (!condition) throw new Error(message); }

function getSetCookies(headers) {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const combined = headers.get("set-cookie");
  if (!combined) return [];
  return combined.split(/,(?=\s*[^\s;,]+=)/g).map((part) => part.trim());
}

function cookieName(setCookie) { return setCookie.slice(0, setCookie.indexOf("=")); }
function cookieValue(setCookie) {
  const firstPart = setCookie.split(";")[0];
  return firstPart.slice(firstPart.indexOf("=") + 1);
}
function hasAttribute(setCookie, attribute) {
  return setCookie.toLowerCase().split(";").map((part) => part.trim()).includes(attribute.toLowerCase());
}
function collectCookies(setCookies, jar = new Map()) {
  for (const setCookie of setCookies) jar.set(cookieName(setCookie), cookieValue(setCookie));
  return jar;
}
function cookieHeader(jar) {
  return Array.from(jar.entries()).map(([name, value]) => `${name}=${value}`).join("; ");
}

async function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { accept: "application/json", ...(options.body ? { "content-type": "application/json" } : {}), ...(options.headers || {}) },
  });
}

function assertCookieAttributes(setCookies) {
  const access = setCookies.find((cookie) => cookie.startsWith(`${cookieNames.accessToken}=`));
  const refresh = setCookies.find((cookie) => cookie.startsWith(`${cookieNames.refreshToken}=`));
  const csrf = setCookies.find((cookie) => cookie.startsWith(`${cookieNames.csrfToken}=`));
  assert(access, "login must set access-token cookie");
  assert(refresh, "login must set refresh-token cookie");
  assert(csrf, "login must set CSRF cookie");
  for (const cookie of [access, refresh]) {
    assert(hasAttribute(cookie, "HttpOnly"), `${cookieName(cookie)} must be HttpOnly`);
    assert(hasAttribute(cookie, "Secure"), `${cookieName(cookie)} must be Secure in staging-style mode`);
    assert(hasAttribute(cookie, "SameSite=Lax"), `${cookieName(cookie)} must use SameSite=Lax`);
    assert(hasAttribute(cookie, "Path=/"), `${cookieName(cookie)} must use Path=/`);
  }
  assert(!hasAttribute(csrf, "HttpOnly"), "CSRF cookie must be readable by the client");
  assert(hasAttribute(csrf, "Secure"), "CSRF cookie must be Secure in staging-style mode");
  assert(hasAttribute(csrf, "SameSite=Lax"), "CSRF cookie must use SameSite=Lax");
  assert(hasAttribute(csrf, "Path=/"), "CSRF cookie must use Path=/");
}

const health = await request("/health");
assert(health.status === 200, `expected /health 200 through proxy, got ${health.status}`);

const bootstrap = await request("/auth/bootstrap/status");
assert(bootstrap.status === 200, `expected bootstrap status 200 through proxy, got ${bootstrap.status}`);

const login = await request("/auth/login", { method: "POST", body: JSON.stringify({ email: "coach@kfit.local", password: "CorrectHorse9" }) });
assert(login.status === 200, `expected login 200 through proxy, got ${login.status}`);
const loginCookies = getSetCookies(login.headers);
assertCookieAttributes(loginCookies);
const jar = collectCookies(loginCookies);

const session = await request("/auth/session", { headers: { cookie: cookieHeader(jar) } });
assert(session.status === 200, `expected session restore 200 through proxy, got ${session.status}`);

const refreshWithoutCsrf = await request("/auth/refresh", { method: "POST", headers: { cookie: cookieHeader(jar) } });
assert(refreshWithoutCsrf.status === 403, `expected refresh without CSRF 403, got ${refreshWithoutCsrf.status}`);

const csrf = jar.get(cookieNames.csrfToken);
assert(csrf, "CSRF token must be present in the cookie jar");

const refresh = await request("/auth/refresh", { method: "POST", headers: { cookie: cookieHeader(jar), "x-csrf-token": csrf } });
assert(refresh.status === 200, `expected refresh with CSRF 200, got ${refresh.status}`);
collectCookies(getSetCookies(refresh.headers), jar);

const logoutWithoutCsrf = await request("/auth/logout", { method: "POST", headers: { cookie: cookieHeader(jar) } });
assert(logoutWithoutCsrf.status === 403, `expected logout without CSRF 403, got ${logoutWithoutCsrf.status}`);

const logout = await request("/auth/logout", { method: "POST", headers: { cookie: cookieHeader(jar), "x-csrf-token": jar.get(cookieNames.csrfToken) } });
assert(logout.status === 200, `expected logout with CSRF 200, got ${logout.status}`);

console.log("✓ staging proxy health route reachable");
console.log("✓ auth cookies keep HttpOnly/Secure/SameSite/Path attributes through Nginx");
console.log("✓ readable CSRF cookie is forwarded as x-csrf-token");
console.log("✓ refresh/logout reject missing CSRF and accept valid double-submit CSRF");
console.log("✓ session restore works through the staging-style Nginx path");
