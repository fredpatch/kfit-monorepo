# K'FIT — Private File Storage Pre-flight

Sprint 0 validates the file-security foundation before any functional upload endpoint is implemented.

## Policy under test

- Default maximum size: 10 MB per file.
- V1 default allowed formats: PDF, JPG/JPEG, PNG and WebP.
- File extension alone is never trusted; the binary signature must match the declared format.
- Executable/script/archive/unsupported uploads are rejected by policy before persistence.
- Internal storage names are generated and never expose the original filename or business identifiers.
- Private files are stored outside any public web root.
- SHA-256 metadata is available for integrity/versioning workflows.
- Malware scanning is mandatory before a file becomes available to downstream workflows.
- Rejected uploads must not create a partial business record.
- Temporary files are purged after the operation/test.
- Secure external delivery will later use random hashed, scoped, expiring and revocable tokens; storage paths are never public identifiers.

## Malware engine

Development pre-flight uses the official `clamav/clamav:stable` Docker image and connects to `clamd` over TCP port 3310.

The production deployment may pin a concrete stable image version/digest, but the behavioral contract remains the same: an upload cannot be published or consumed until malware scan status is `clean`.

## Run

From the repository root:

```bash
git pull
npm install
docker compose up -d clamav
npm run preflight:files
```

The first ClamAV startup can take longer while virus definitions initialize. The pre-flight waits up to two minutes for `clamd` to answer `PING`.

## What the test proves

1. A minimal valid PDF passes binary-signature validation.
2. A PDF renamed as `.png` is rejected.
3. A file above 10 MB is rejected.
4. Stored filenames are random UUID-based names rather than original user filenames.
5. SHA-256 integrity metadata can be generated.
6. A clean file is accepted by ClamAV.
7. The standard EICAR antivirus test payload is detected by ClamAV.
8. Temporary private files are removed at the end of the test.

## Acceptance

The pre-flight is accepted only when the command ends with:

```text
File-storage pre-flight PASSED
```

ClamAV startup failure, signature mismatch acceptance, oversize acceptance, clean-file false positive, EICAR non-detection or purge failure are all blocking failures for Sprint 0.
