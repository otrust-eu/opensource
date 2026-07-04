# OTRUST Python SDK

Official Python SDK for OTRUST - Zero-knowledge timestamps, signing, proofs, and authentication.

## Installation

```bash
pip install otrust
```

## Quick Start

```python
import asyncio
from otrust import timestamp, sign, proof, auth, configure

# Configure (optional - defaults to https://otrust.se)
configure(base_url="https://otrust.se", api_key="your-api-key")

async def main():
    # Create a timestamp
    result = await timestamp.create("Hello, World!")
    if result.ok:
        print(f"Receipt ID: {result.value.receipt_id}")
        print(f"Hash: {result.value.hash}")
    else:
        print(f"Error: {result.error.message}")

asyncio.run(main())
```

## Services

### Timestamp Service

Cryptographic timestamps for documents and data.

```python
from otrust import timestamp
from pathlib import Path

# Timestamp text
result = await timestamp.create("Hello, World!")

# Timestamp a file
result = await timestamp.create(Path("document.pdf"))

# Verify a timestamp
result = await timestamp.verify(receipt_id)
if result.ok and result.value.valid:
    print("Timestamp is valid!")

# Bulk verify multiple timestamps
result = await timestamp.verify_bulk(["receipt1", "receipt2"])

# Get proof for a timestamp
result = await timestamp.get_proof(receipt_id)

# Lookup by hash
result = await timestamp.lookup(hash_value)
```

### Sign Service

Digital signature workflows.

```python
from otrust import sign
from otrust.sign import Party, CreateSignOptions
from pathlib import Path

# Create a signing request
result = await sign.create(
    Path("contract.pdf"),
    CreateSignOptions(
        title="Contract Agreement",
        description="Please review and sign",
        creator_email="alice@example.com",
        parties=[
            Party(email="bob@example.com", role="signer"),
            Party(email="carol@example.com", role="approver"),
        ],
    ),
)
if result.ok:
    print(f"Request ID: {result.value.request_id}")
    print(f"Sign URL: {result.value.signing_url}")

# Check status
result = await sign.status(request_id)

# Send reminder
result = await sign.remind(request_id, "bob@example.com")

# Cancel request
result = await sign.cancel(request_id)

# Verify a signed document
result = await sign.verify_document(Path("signed.pdf"))

# Get signed package
result = await sign.get_package(request_id)
```

### Proof Service

Zero-knowledge identity proofs.

```python
from otrust import proof

# Create identity proof
# IMPORTANT: Store the `secret` securely - it's your only way to prove ownership!
result = await proof.identity(
    personnummer="19900101-1234",
    birth_date="1990-01-01",
    face_match=True,
    liveness_verified=True,
)
if result.ok:
    print(f"Proof ID: {result.value.proof_id}")
    print(f"Secret (SAVE THIS!): {result.value.secret}")
    print(f"Share URL: {result.value.share_url}")

# Create age proof (e.g., 18+)
result = await proof.age("1990-01-01", min_age=18)

# Create membership proof
result = await proof.membership(
    member_id="member123",
    organization_id="org456",
    organization_name="ACME Corp",
)

# Get proof details
result = await proof.get("id_abc123")

# Verify a proof
result = await proof.verify("id_abc123")

# Get wallet pass
result = await proof.wallet("id_abc123", format="apple")

# Revoke a proof
result = await proof.revoke("id_abc123")
```

### Auth Service

OAuth2/OIDC authentication with zero-knowledge proofs.

```python
from otrust import auth

# Generate login URL
url = auth.login_url(
    client_id="my-app",
    redirect_uri="https://myapp.com/callback",
    scope="identity",  # or ["identity", "age:18"]
)
# Redirect user to this URL

# Handle callback
params = auth.parse_callback(callback_url)
if params and params.get("code"):
    # Exchange code for tokens
    result = await auth.prove(
        code=params["code"],
        client_id="my-app",
        client_secret="secret",
        redirect_uri="https://myapp.com/callback",
    )
    if result.ok:
        print(f"Access token: {result.value.access_token}")
        
        # Get user info
        user_result = await auth.userinfo(result.value.access_token)
        if user_result.ok:
            print(f"User: {user_result.value.sub}")

# Verify a token
result = await auth.verify(access_token)

# Refresh tokens
result = await auth.refresh(
    refresh_token=refresh_token,
    client_id="my-app",
    client_secret="secret",
)
```

## Result Types

All async operations return a `Result` type for safe error handling:

```python
from otrust import Result, OTrustError, is_ok, unwrap

result = await timestamp.create("Hello")

# Option 1: Check .ok property
if result.ok:
    print(f"Success: {result.value}")
else:
    print(f"Error: {result.error.message}")

# Option 2: Use helper functions
if is_ok(result):
    value = unwrap(result)
    print(f"Success: {value}")

# Option 3: Use unwrap_or for defaults
from otrust import unwrap_or
value = unwrap_or(result, default_value)
```

## Crypto Utilities

```python
from otrust.crypto import sha256, hash_file, is_valid_hash

# Hash text
hash_value = sha256("Hello, World!")

# Hash file
hash_value = await hash_file(Path("document.pdf"))

# Hash file with progress callback
async def on_progress(bytes_processed, total_bytes):
    percent = (bytes_processed / total_bytes) * 100
    print(f"Progress: {percent:.1f}%")

hash_value = await hash_file_with_progress(
    Path("large-file.zip"),
    progress_callback=on_progress,
)

# Validate hash format
if is_valid_hash(hash_value):
    print("Valid SHA-256 hash")
```

## Configuration

```python
from otrust import configure

# Configure globally
configure(
    base_url="https://otrust.se",
    api_key="your-api-key",
    timeout=30.0,
    max_retries=3,
)
```

## Requirements

- Python 3.9+
- httpx (async HTTP client)

## License

MIT
