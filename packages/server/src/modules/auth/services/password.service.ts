import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

export type PasswordHashOptions = {
  saltBytes: number;
  keyLength: number;
  cost: number;
  blockSize: number;
  parallelization: number;
  minLength: number;
};

export const defaultPasswordHashOptions: PasswordHashOptions = {
  saltBytes: 16,
  keyLength: 64,
  cost: 16_384,
  blockSize: 8,
  parallelization: 1,
  minLength: 12,
};

export type PasswordStrengthResult =
  | { ok: true }
  | { ok: false; reason: "too_short" | "missing_letter" | "missing_number" };

export function validatePasswordStrength(password: string, options: Pick<PasswordHashOptions, "minLength"> = defaultPasswordHashOptions): PasswordStrengthResult {
  if (password.length < options.minLength) return { ok: false, reason: "too_short" };
  if (!/[A-Za-z]/.test(password)) return { ok: false, reason: "missing_letter" };
  if (!/\d/.test(password)) return { ok: false, reason: "missing_number" };
  return { ok: true };
}

function encodeHash(input: {
  cost: number;
  blockSize: number;
  parallelization: number;
  keyLength: number;
  salt: Buffer;
  digest: Buffer;
}): string {
  return [
    "kfit-scrypt",
    "v=1",
    `N=${input.cost}`,
    `r=${input.blockSize}`,
    `p=${input.parallelization}`,
    `keylen=${input.keyLength}`,
    input.salt.toString("base64url"),
    input.digest.toString("base64url"),
  ].join("$");
}

function parseHash(hash: string) {
  const [algorithm, version, cost, blockSize, parallelization, keyLength, salt, digest] = hash.split("$");
  if (algorithm !== "kfit-scrypt" || version !== "v=1" || !cost || !blockSize || !parallelization || !keyLength || !salt || !digest) {
    return null;
  }

  const parsed = {
    cost: Number(cost.replace("N=", "")),
    blockSize: Number(blockSize.replace("r=", "")),
    parallelization: Number(parallelization.replace("p=", "")),
    keyLength: Number(keyLength.replace("keylen=", "")),
    salt: Buffer.from(salt, "base64url"),
    digest: Buffer.from(digest, "base64url"),
  };

  if (
    !Number.isSafeInteger(parsed.cost) ||
    !Number.isSafeInteger(parsed.blockSize) ||
    !Number.isSafeInteger(parsed.parallelization) ||
    !Number.isSafeInteger(parsed.keyLength) ||
    parsed.cost <= 0 ||
    parsed.blockSize <= 0 ||
    parsed.parallelization <= 0 ||
    parsed.keyLength <= 0
  ) {
    return null;
  }

  return parsed;
}

export class PasswordService {
  constructor(private readonly options: PasswordHashOptions = defaultPasswordHashOptions) {}

  validate(password: string): PasswordStrengthResult {
    return validatePasswordStrength(password, this.options);
  }

  async hash(password: string): Promise<string> {
    const strength = this.validate(password);
    if (!strength.ok) {
      throw new Error(`Password does not satisfy policy: ${strength.reason}`);
    }

    const salt = randomBytes(this.options.saltBytes);
    const digest = await scrypt(password, salt, this.options.keyLength, {
      N: this.options.cost,
      r: this.options.blockSize,
      p: this.options.parallelization,
    }) as Buffer;

    return encodeHash({
      cost: this.options.cost,
      blockSize: this.options.blockSize,
      parallelization: this.options.parallelization,
      keyLength: this.options.keyLength,
      salt,
      digest,
    });
  }

  async verify(password: string, passwordHash: string): Promise<boolean> {
    const parsed = parseHash(passwordHash);
    if (!parsed) return false;

    const candidate = await scrypt(password, parsed.salt, parsed.keyLength, {
      N: parsed.cost,
      r: parsed.blockSize,
      p: parsed.parallelization,
    }) as Buffer;

    return candidate.length === parsed.digest.length && timingSafeEqual(candidate, parsed.digest);
  }
}
