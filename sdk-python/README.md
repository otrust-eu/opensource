# OTRUST Python SDK

Typed async client for OTRUST timestamping, signing, public range-proof
submission, and issuer-gated Auth.

## Production status

- Timestamp and Sign are available.
- Age and income proofs must be generated locally with the published Groth16
  artifacts.
- Range-proof publishing fails closed until the public trusted-setup ceremony
  is complete.
- Auth fails closed until a trusted issuer and exact client redirect allowlist
  are configured.
- Legacy self-attested identity, server-side private proof generation,
  membership generation, client revocation, and backup email are retired.

## Installation

```bash
pip install otrust
```

Python 3.10 or newer is required.

## Configuration

```python
from otrust import configure

configure(
    base_url="https://www.otrust.eu",
    timeout=30.0,
    retries=3,
)
```

## Timestamp

```python
from pathlib import Path
from otrust import timestamp

created = await timestamp.create(Path("document.pdf"))
verified = await timestamp.verify(receipt_id)
stored_proof = await timestamp.get_proof(receipt_id)
```

Persist receipt IDs in your own storage. Receipt lists are intentionally
client-side.

## Proof

Generate a proof locally. Never pass a date of birth, exact income, witness, or
randomness to the API.

```python
from otrust import proof

result = await proof.submit_browser_proof(
    proof_type="age",
    proof_data=groth16_proof,
    public_signals=public_signals,
    commitment=public_signals[5],
)

if result.ok:
    print(result.value["proofId"])

details = await proof.get("id_abc123")
verification = await proof.verify("id_abc123")
```

A valid range proof establishes consistency with a committed private value. It
does not establish that a government, employer, bank, or other trusted issuer
checked that value.

Compatibility methods such as `proof.identity()`, `proof.age()`,
`proof.income()`, `proof.membership()`, `proof.revoke()`, and
`proof.email_backup()` fail locally without transmitting their inputs.

## Auth

Create the challenge from your server. Store state in your own session and use
only the `login_url` returned by OTRUST:

```python
from otrust import auth

state = auth.generate_state()
challenge = await auth.create_challenge(
    client_id="my-app",
    redirect_uri="https://my-app.example/auth/callback",
    scope=["identity"],
    state=state,
)

if challenge.ok:
    redirect_user(challenge.value.login_url)
```

In the callback, compare state and verify the token server-side:

```python
callback = auth.parse_callback(request_url)

if auth.verify_state(session_state, callback.get("state", "")):
    verified = await auth.verify(callback["token"])
    user = await auth.userinfo(callback["token"])
```

Auth accepts only current trusted issuer-bound identity credentials.

## Result values

Operations return `Ok[T]` or `Err[OTrustError]`:

```python
if result.ok:
    value = result.value
else:
    print(result.error.code, result.error.message)
```

## Security

- Keep API keys, Auth tokens, signing links, and cancellation tokens out of
  logs.
- Keep Auth state in the user's server or browser session.
- Verify state, token expiry, redirect URI, and issuer binding.
- Pin reviewed package versions in production.

Report vulnerabilities privately to `security@otrust.eu`.

## License

MIT
