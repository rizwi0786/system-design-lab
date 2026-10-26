---
id: m14-jwt
title: JWT validation and limitations
module: m14
level: intermediate
status: reviewed
template: lesson
minutes: 90
prerequisites: [m14-authn-vs-authz, m14-oauth-oidc]
related: [m14-rbac-pbac, m14-passwords-secrets, m14-tls-encryption, m10-gateways-proxies-lb, m10-webhooks]
tags: [security, jwt, jws, signing, hmac, rsa, ecdsa, jwks, revocation, aspnetcore]
patterns: [Self-contained Token, Key Rotation via JWKS, Deny List]
summary: A JWT is a signed, base64url-encoded set of claims that any server holding the right key can check without a database call. Learn its structure, HS256 versus RS256 and ES256, the full validation checklist (signature, alg, kid, iss, aud, exp, nbf), the attacks that skipped steps allow, and its real limits around revocation and size. Then build HS256 signing and a validator in C#.
references:
  - title: "RFC 7519 — JSON Web Token (JWT)"
    url: https://www.rfc-editor.org/rfc/rfc7519
  - title: "RFC 7515 — JSON Web Signature (JWS)"
    url: https://www.rfc-editor.org/rfc/rfc7515
  - title: "RFC 8725 — JSON Web Token Best Current Practices"
    url: https://www.rfc-editor.org/rfc/rfc8725
  - title: "Microsoft Learn — Configure JWT bearer authentication in ASP.NET Core"
    url: https://learn.microsoft.com/aspnet/core/security/authentication/configure-jwt-bearer-authentication
  - title: "Microsoft Learn — CryptographicOperations.FixedTimeEquals"
    url: https://learn.microsoft.com/dotnet/api/system.security.cryptography.cryptographicoperations.fixedtimeequals
---

A city bus service sells monthly passes in a mobile app. Two million riders open the app every morning, and every tap on "Show my pass" calls an API. If each call had to look up a session in a database, that database would be the busiest thing in the city at 08:30. Instead the app sends a **JSON Web Token**: a small, signed note saying "rider 42 has a valid pass until 31 October, signed by the pass service". Any API server can check the signature in microseconds with no database at all. That speed comes with a price: a signed note can't be taken back once it is handed out. This lesson teaches both halves: how to validate a JWT properly, and how to live with what it can't do.

## Learning objectives

By the end of this lesson you will be able to:

1. Read a JWT's three parts and explain what base64url encoding does and does not hide.
2. Choose between HS256 (shared secret) and RS256 or ES256 (public/private key pairs), and explain why it matters who can *mint* tokens.
3. Apply the full validation checklist: structure, `alg` allowlist, `kid` and JWKS lookup, signature, `iss`, `aud`, `exp`, `nbf`, and your own claims.
4. Explain the classic attacks: `alg: none`, algorithm confusion, missing audience checks and `kid` injection.
5. Design revocation for self-contained tokens: short lifetimes, deny lists by `jti`, per-user cutoffs, and refresh tokens.
6. Implement HS256 signing and verification in C# with `System.Security.Cryptography`, and a validator for ES256/RS256 with key rotation.
7. Configure ASP.NET Core's JWT bearer handler correctly.

## Prerequisites

- [Authentication versus authorization](#/lesson/m14-authn-vs-authz): sessions versus tokens and the revocation trade-off.
- [OAuth 2.0 and OpenID Connect](#/lesson/m14-oauth-oidc): where access tokens and ID tokens come from, and what audience means.

## Explain it like I'm a beginner

Imagine a **wax-sealed letter** from a king. The letter says "The bearer may enter the eastern gate until the full moon." Anyone can *read* it. The seal is what matters: only the king's ring can make it, and every guard knows what the king's seal looks like. A guard who sees an unbroken royal seal lets you in without sending a messenger back to the palace.

A JWT is that letter:

- The **header** says which kind of seal was used ("RSA seal", "HMAC seal") and which ring made it (the key id).
- The **payload** is the message: who you are, who the letter is for, when it expires.
- The **signature** is the wax seal.

Three consequences follow, and they are the whole lesson in miniature:

1. **Anyone can read the letter.** A JWT is *encoded*, not *encrypted*. Never put secrets in it.
2. **Guards must check the seal and the details.** An unbroken seal on a letter addressed to a *different* gate, or one dated last year, must still be refused.
3. **A letter can't be recalled.** If you hand a letter to someone who turns out to be a thief, every guard will keep honouring it until the full moon, unless you send all guards a "do not accept letter number 7" notice. That notice is a **deny list**, and it brings back the database lookup we were trying to avoid.

## First-principles explanation

### Structure

A JWT in its common form (a **JWS**, JSON Web Signature) is three base64url strings joined by dots:

```text
eyJhbGciOiJFUzI1NiIsImtpZCI6InBhc3MtMjAyNi0xMCIsInR5cCI6IkpXVCJ9   ← header
.eyJpc3MiOiJodHRwczovL3Bhc3MuY2l0eWJ1cy5pbiIsInN1YiI6InJpZGVyLTQyIiwiYXVkIjoicGFzcy1hcGkiLCJleHAiOjE3NjA5NTE4MDB9   ← payload
.MEUCIQ...   ← signature
```

Decoded:

```json
{ "alg": "ES256", "kid": "pass-2026-10", "typ": "JWT" }
{ "iss": "https://pass.citybus.in", "sub": "rider-42", "aud": "pass-api",
  "iat": 1760948200, "nbf": 1760948200, "exp": 1760951800, "jti": "b7c1e0…", "scope": "pass.read" }
```

**Base64url** is base64 with `-` and `_` instead of `+` and `/`, and no `=` padding, so the token is safe in URLs and headers. It is an *encoding*: reversible by anyone, with no key. A token with a PAN number or a phone number in it is publishing that number to every device and log line it passes through. (A **JWE**, JSON Web Encryption, has five parts and does encrypt, but it is much less common for access tokens.)

The **signature** is computed over the exact ASCII bytes `base64url(header) + "." + base64url(payload)`. Change one character of either, and the signature no longer matches.

### Registered claims

| Claim | Meaning | Validation |
|---|---|---|
| `iss` | Issuer: who created the token | Must equal the exact issuer you trust |
| `sub` | Subject: who the token is about | Use as the stable user id |
| `aud` | Audience: who the token is for (string or array) | Must contain *your* API's identifier |
| `exp` | Expiry, seconds since 1970-01-01 UTC | Reject if now ≥ exp (allow small clock skew) |
| `nbf` | Not before | Reject if now < nbf (allow skew) |
| `iat` | Issued at | Used for revocation cutoffs and age checks |
| `jti` | Unique token id | Used for deny lists and replay detection |

Times are **numbers of seconds**, not milliseconds. A token with `exp` in milliseconds looks like it expires in the year 57,000.

### Signing algorithms: who can mint tokens?

| | HS256 | RS256 | ES256 |
|---|---|---|---|
| Kind | HMAC with SHA-256, one **shared secret** | RSA signature (PKCS#1 v1.5) with SHA-256, **private/public key pair** | ECDSA on curve P-256 with SHA-256, **key pair** |
| Who can verify | Anyone with the secret | Anyone with the public key | Anyone with the public key |
| Who can **mint** | **Anyone who can verify** | Only the private key holder | Only the private key holder |
| Signature size | 32 bytes (43 chars) | 256 bytes for a 2048-bit key (342 chars) | 64 bytes (86 chars) |
| Verify speed | Fastest | Fast (RSA verification is cheap) | Slower than RSA to verify, faster to sign (estimate; measure on your hardware) |
| Good for | One service that both issues and checks its own tokens | Identity providers with many verifying APIs | Same, when size matters (QR codes, cookies, IoT) |

The deciding question is the **"who can mint"** row. With HS256, every API that validates tokens holds the secret, so a compromise of *any* of them lets an attacker mint tokens for *all* of them. With RS256 or ES256, the 30 APIs that verify tokens hold only the public key. Stealing it achieves nothing. That's why identity providers sign with asymmetric keys and publish the public keys at a **JWKS** (JSON Web Key Set) endpoint.

HS256 keys must be at least 256 bits of real randomness. A secret like `"mysecret"` can be brute-forced offline from a single captured token, because an attacker can try billions of guesses against the signature on their own GPU.

### `kid` and JWKS: rotating keys without downtime

Keys must be rotated: on a schedule, and immediately if one leaks. The header's `kid` (key id) says which key signed this token. The issuer publishes all current public keys:

```json
{ "keys": [
  { "kty": "EC", "crv": "P-256", "kid": "pass-2026-10", "use": "sig", "alg": "ES256", "x": "…", "y": "…" },
  { "kty": "EC", "crv": "P-256", "kid": "pass-2026-09", "use": "sig", "alg": "ES256", "x": "…", "y": "…" } ] }
```

Rotation is three steps: (1) **publish** the new public key in the JWKS while still signing with the old one, and wait for every validator's cache to pick it up; (2) **start signing** with the new key; (3) **remove** the old key after the longest token lifetime has passed. Validators cache the JWKS (for example 24 hours) and refetch early when they see an unknown `kid`, rate-limited so attackers can't force a fetch per request.

### The validation checklist

Order matters. Do the cheap, structural checks first, and never trust a claim before the signature is verified.

1. **Size and shape.** Reject tokens over a limit (say 8 KB) and anything that isn't exactly three parts.
2. **Decode header.** Parse JSON safely. Malformed → reject.
3. **`alg` allowlist.** Accept only the algorithms you expect, for example `ES256`. Never `none`.
4. **Find the key by `kid`** in *your trusted key set*. Never fetch a key from a URL inside the token (`jku`, `x5u`) unless it is on an allowlist.
5. **Key and algorithm must agree.** An EC key verifies only ES256. This blocks algorithm confusion.
6. **Verify the signature** over the exact bytes received.
7. **`iss`** equals the trusted issuer, exactly.
8. **`aud`** contains this API.
9. **`exp`** is in the future and **`nbf`** in the past, each with a small clock skew allowance (30–60 s is plenty with NTP. ASP.NET Core's default of 5 minutes is generous).
10. **Revocation** if you need it: `jti` not on the deny list, `iat` after the user's cutoff.
11. **Your own claims**: required scope, tenant, `typ` (for example `at+jwt` for access tokens, RFC 9068) so an ID token can't be used as an access token.

### The attacks that skipped steps allow

- **`alg: none`.** The JWT spec allows unsigned tokens with `"alg":"none"` and an empty signature. Early libraries honoured it, so an attacker could write any payload. Fix: step 3.
- **Algorithm confusion.** A server expects RS256 and uses a library function `Verify(token, key)` that picks the algorithm from the header. The attacker sends `"alg":"HS256"` and signs with the server's *public* RSA key as the HMAC secret. The server "verifies" an HMAC with that same public key, and it matches. Fix: step 5, the key decides the algorithm, not the token.
- **Missing audience check.** A token for the HR app is accepted by the payments API because both trust the same issuer. Fix: step 8.
- **`kid` injection.** A `kid` like `../../dev/null` or `' OR 1=1 --` used in a file path or SQL query. Fix: treat `kid` as an opaque lookup key in an in-memory dictionary.
- **Decoding without validating.** Code that calls "decode" to read `sub` and never verifies. The payload is attacker-controlled until step 6 passes.

### Limitations

**Revocation.** A valid JWT stays valid until `exp`. Options, from cheapest to strongest:

| Approach | Revocation delay | Cost |
|---|---|---|
| Short access token lifetime (5–15 min) plus refresh tokens checked at the issuer | Up to one lifetime | Refresh traffic at the issuer |
| Per-user cutoff: "reject tokens with `iat` before T" | Immediate for that user | A small lookup (cacheable) per request |
| Deny list by `jti` | Immediate for that token | Lookup per request. The list only needs entries until each token's `exp` |
| Opaque tokens with introspection | Immediate | A network call per request (cache 30–60 s) |

The deny list stays small because entries can be deleted once the token would have expired anyway. With 15-minute tokens, a deny list rarely holds more than a few thousand entries.

**Size.** A typical access token is 800 bytes to 2 KB, sent on every request. Adding 200 group ids can push it past 8 KB, at which point proxies start rejecting headers (common defaults are 8 KB per header line for nginx and 32 KB total for Kestrel's request headers) and cookies exceed browsers' ~4 KB limit. Keep tokens small: put *identity and coarse scopes* in the token and look up fine-grained permissions server-side.

**Staleness.** Claims are frozen at issue time. A user demoted at 10:00 still has `role=Admin` in a token issued at 09:55. Short lifetimes bound this.

**No logout.** "Logout" for a pure-JWT system only deletes the token from the client. The token still works if someone copied it.

### When a simpler alternative is enough

- One web app on one domain: a cookie session (server-side or ASP.NET Core's encrypted cookie) is simpler and gives instant logout. You don't need JWTs.
- You need instant revocation on every request anyway (banking admin consoles): opaque tokens with introspection, or sessions, are more honest than JWTs plus a deny list hit on every call.
- JWTs shine when **many independent services** must verify identity **without a shared store**, or when tokens must be checked **offline**.

## Visual explanation

### Anatomy and trust

```mermaid
flowchart LR
    ISS["Pass service (holds private key)"] -->|"signs header.payload with ES256"| TOK["JWT: header . payload . signature"]
    ISS -->|"publishes public keys"| JWKS["JWKS endpoint (kid to public key)"]
    TOK -->|"Authorization: Bearer"| GW["API gateway"]
    JWKS -.->|"fetched and cached 24 h"| GW
    GW -->|"verified claims as headers over mTLS"| API["Pass API"]
    JWKS -.->|"cached"| API
    API -->|"jti and user cutoff, cached"| RL[("Revocation store")]
```

The pass service is the only component holding the **private key**, so it is the only one that can mint tokens. Every verifier (gateway, pass API) downloads the **public** keys from the JWKS endpoint and caches them; the dotted arrows happen once a day, not per request. The gateway does the full checklist and rejects bad tokens early. The pass API validates again (defence in depth: it should not trust anything just because it arrived from inside the network) and is the place where revocation is checked, because only high-value operations need the extra lookup.

### Validation with a key rotation in progress

```mermaid
sequenceDiagram
    participant App as Rider app
    participant GW as Gateway
    participant Cache as JWKS cache
    participant IdP as Pass service JWKS
    App->>GW: GET /pass with Bearer token, kid pass-2026-11
    GW->>GW: three parts, alg ES256 is allowed
    GW->>Cache: find key pass-2026-11
    Cache-->>GW: not found
    GW->>IdP: GET jwks.json (at most once per 5 min)
    IdP-->>GW: keys pass-2026-11 and pass-2026-10
    GW->>Cache: store both keys
    GW->>GW: verify signature, iss, aud, exp, nbf
    GW-->>App: 200 pass details
    App->>GW: next request with same kid
    GW->>Cache: find key pass-2026-11
    Cache-->>GW: found
    GW-->>App: 200 (no JWKS call)
```

The first request after a rotation carries a `kid` the gateway hasn't seen. Instead of failing, the gateway refetches the JWKS, but only if it hasn't done so in the last 5 minutes. Without that limit, an attacker could send tokens with random `kid` values and turn every request into a JWKS fetch, a cheap denial-of-service. Every later request is served from the cache. This is why step 1 of rotation ("publish before you sign") matters: if validators had cached the old JWKS and couldn't refetch, new tokens would fail.

## Step-by-step example

### Step 1 — decode (and why decoding is not enough)

Split on `.`, base64url-decode the first two parts, and parse JSON. You can now *read* `sub` and `exp`. You have proven nothing: anyone could have typed this payload.

### Step 2 — HS256 by hand

To sign: `signature = HMAC-SHA256(secret, ASCII(headerB64 + "." + payloadB64))`, then base64url-encode it. To verify: recompute and compare with `CryptographicOperations.FixedTimeEquals`. An ordinary `==` stops at the first differing byte, and attackers can measure that timing difference to guess a valid signature byte by byte.

### Step 3 — switch to ES256 for the bus pass

The pass service generates a P-256 key pair, signs with the private key, and exposes the public key in `/.well-known/jwks.json`. APIs verify with `ECDsa.VerifyData`. JWS uses the raw 64-byte `r‖s` signature format, which is what .NET's `ECDsa.SignData` and `VerifyData` produce by default.

### Step 4 — add the claim checks

Issuer, audience, expiry and not-before, with 30 s skew. Reject `typ` values other than the ones you issue.

### Step 5 — revocation for stolen phones

When a rider reports a stolen phone, set a per-user cutoff: tokens for `rider-42` with `iat` before now are rejected. The rider logs in on their new phone and gets fresh tokens. Access tokens live 15 minutes, so the cutoff entry can be deleted after 15 minutes.

## Production-style C# implementation

```text
BusPass.Api/
  Program.cs
  Tokens/
    SigningKeys.cs
    JwksParser.cs
    SigningKeyProvider.cs
    RevocationList.cs
    JwtValidator.cs
    JwtIssuer.cs
    BusPassBearerHandler.cs
```

```csharp file=Tokens/SigningKeys.cs
using System.Security.Cryptography;

namespace BusPass.Tokens;

/// <summary>A verification key bound to exactly one algorithm. The key decides the algorithm, never the token header.</summary>
public abstract class SigningKey(string kid, string algorithm)
{
    public string Kid { get; } = kid;
    public string Algorithm { get; } = algorithm;
    public abstract bool Verify(ReadOnlySpan<byte> signingInput, ReadOnlySpan<byte> signature);
}

public sealed class HmacSigningKey : SigningKey
{
    private readonly byte[] _secret;
    public HmacSigningKey(string kid, byte[] secret) : base(kid, "HS256")
    {
        if (secret.Length < 32) throw new ArgumentException("HS256 secrets must be at least 256 bits.", nameof(secret));
        _secret = secret;
    }

    public byte[] Sign(ReadOnlySpan<byte> signingInput) => HMACSHA256.HashData(_secret, signingInput);

    public override bool Verify(ReadOnlySpan<byte> signingInput, ReadOnlySpan<byte> signature)
    {
        Span<byte> expected = stackalloc byte[32];
        HMACSHA256.HashData(_secret, signingInput, expected);
        return CryptographicOperations.FixedTimeEquals(expected, signature);
    }
}

public sealed class RsaSigningKey(string kid, RSA publicKey) : SigningKey(kid, "RS256")
{
    public override bool Verify(ReadOnlySpan<byte> signingInput, ReadOnlySpan<byte> signature) =>
        publicKey.VerifyData(signingInput, signature, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
}

public sealed class EcSigningKey(string kid, ECDsa publicKey) : SigningKey(kid, "ES256")
{
    // .NET's default ECDSA signature format is IEEE P1363 (r||s), exactly what JWS uses.
    public override bool Verify(ReadOnlySpan<byte> signingInput, ReadOnlySpan<byte> signature) =>
        signature.Length == 64 && publicKey.VerifyData(signingInput, signature, HashAlgorithmName.SHA256);
}
```

```csharp file=Tokens/JwksParser.cs
using System.Buffers.Text;
using System.Security.Cryptography;
using System.Text.Json;

namespace BusPass.Tokens;

public static class JwksParser
{
    /// <summary>Reads public signing keys from a JWKS document. Unknown key types and curves are skipped, not trusted.</summary>
    public static IReadOnlyList<SigningKey> Parse(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var keys = new List<SigningKey>();
        foreach (var k in doc.RootElement.GetProperty("keys").EnumerateArray())
        {
            if (k.TryGetProperty("use", out var use) && use.GetString() != "sig") continue;
            var kid = k.GetProperty("kid").GetString();
            if (string.IsNullOrEmpty(kid)) continue;
            switch (k.GetProperty("kty").GetString())
            {
                case "RSA":
                    var rsa = RSA.Create();
                    rsa.ImportParameters(new RSAParameters { Modulus = Bytes(k, "n"), Exponent = Bytes(k, "e") });
                    if (rsa.KeySize < 2048) continue;   // refuse weak keys
                    keys.Add(new RsaSigningKey(kid, rsa));
                    break;
                case "EC" when k.GetProperty("crv").GetString() == "P-256":
                    keys.Add(new EcSigningKey(kid, ECDsa.Create(new ECParameters
                    {
                        Curve = ECCurve.NamedCurves.nistP256,
                        Q = new ECPoint { X = Bytes(k, "x"), Y = Bytes(k, "y") },
                    })));
                    break;
            }
        }
        return keys;
    }

    public static string ToJwks(string kid, ECDsa key)
    {
        var p = key.ExportParameters(includePrivateParameters: false);
        return JsonSerializer.Serialize(new
        {
            keys = new[] { new { kty = "EC", crv = "P-256", kid, use = "sig", alg = "ES256",
                                 x = Base64Url.EncodeToString(p.Q.X), y = Base64Url.EncodeToString(p.Q.Y) } },
        });
    }

    private static byte[] Bytes(JsonElement k, string name) => Base64Url.DecodeFromChars(k.GetProperty(name).GetString());
}
```

```csharp file=Tokens/SigningKeyProvider.cs
using System.Collections.Frozen;

namespace BusPass.Tokens;

public interface ISigningKeyProvider
{
    SigningKey? Find(string kid);
}

/// <summary>Holds the current key set. A background refresher (or the JWT bearer handler's ConfigurationManager)
/// replaces it from the JWKS endpoint every few hours, and early when an unknown kid appears, at most once per 5 minutes.</summary>
public sealed class InMemorySigningKeyProvider : ISigningKeyProvider
{
    private volatile FrozenDictionary<string, SigningKey> _keys = FrozenDictionary<string, SigningKey>.Empty;

    public void Replace(IEnumerable<SigningKey> keys) =>
        _keys = keys.ToFrozenDictionary(k => k.Kid, StringComparer.Ordinal);

    public SigningKey? Find(string kid) => _keys.GetValueOrDefault(kid);
}
```

```csharp file=Tokens/RevocationList.cs
using System.Collections.Concurrent;

namespace BusPass.Tokens;

public interface IRevocationChecker
{
    bool IsRevoked(string? jti, string? subject, DateTimeOffset issuedAt);
}

/// <summary>Deny list by jti plus per-user cutoffs. In production this lives in Redis so every instance sees it;
/// entries are deleted once the newest affected token would have expired anyway.</summary>
public sealed class InMemoryRevocationList(TimeProvider clock) : IRevocationChecker
{
    private readonly ConcurrentDictionary<string, DateTimeOffset> _deniedJti = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<string, DateTimeOffset> _userCutoff = new(StringComparer.Ordinal);

    public void DenyToken(string jti, DateTimeOffset tokenExpiresAt) => _deniedJti[jti] = tokenExpiresAt;

    /// <summary>"Log out everywhere" or "phone stolen": every token issued before now is rejected.</summary>
    public void RevokeAllFor(string subject) => _userCutoff[subject] = clock.GetUtcNow();

    public bool IsRevoked(string? jti, string? subject, DateTimeOffset issuedAt) =>
        (jti is not null && _deniedJti.ContainsKey(jti)) ||
        (subject is not null && _userCutoff.TryGetValue(subject, out var cutoff) && issuedAt < cutoff);

    public void PurgeExpired()
    {
        var now = clock.GetUtcNow();
        foreach (var kv in _deniedJti) if (kv.Value < now) _deniedJti.TryRemove(kv.Key, out _);
    }
}
```

```csharp file=Tokens/JwtValidator.cs
using System.Buffers.Text;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace BusPass.Tokens;

public sealed class JwtValidationOptions
{
    public string Issuer { get; set; } = "https://pass.citybus.in";
    public string Audience { get; set; } = "pass-api";
    public TimeSpan ClockSkew { get; set; } = TimeSpan.FromSeconds(30);
    public HashSet<string> AllowedAlgorithms { get; } = new(StringComparer.Ordinal) { "ES256", "RS256" };
    public int MaxTokenLength { get; set; } = 8 * 1024;
}

public enum JwtError { None, Malformed, UnsupportedAlgorithm, UnknownKey, BadSignature, WrongIssuer, WrongAudience, Expired, NotYetValid, Revoked }

public sealed record JwtValidationResult(JwtError Error, JsonElement Payload)
{
    public bool IsValid => Error == JwtError.None;
}

public sealed class JwtValidator(ISigningKeyProvider keys, IRevocationChecker revocations,
                                 IOptions<JwtValidationOptions> options, TimeProvider clock)
{
    private readonly JwtValidationOptions _o = options.Value;

    public JwtValidationResult Validate(string token)
    {
        if (token.Length > _o.MaxTokenLength) return Fail(JwtError.Malformed);
        var parts = token.Split('.');
        if (parts.Length != 3) return Fail(JwtError.Malformed);   // 5 parts would be JWE, which we don't accept here

        JsonElement header, payload;
        byte[] signature;
        try
        {
            header = ParseSegment(parts[0]);
            payload = ParseSegment(parts[1]);
            signature = Base64Url.DecodeFromChars(parts[2]);
        }
        catch (Exception e) when (e is FormatException or JsonException) { return Fail(JwtError.Malformed); }
        if (header.ValueKind != JsonValueKind.Object || payload.ValueKind != JsonValueKind.Object) return Fail(JwtError.Malformed);

        // 1. Algorithm allowlist ("none" is never in it).
        var alg = GetString(header, "alg");
        if (alg is null || !_o.AllowedAlgorithms.Contains(alg)) return Fail(JwtError.UnsupportedAlgorithm);

        // 2. Key lookup by kid in OUR key set; the key's own algorithm must match.
        var kid = GetString(header, "kid");
        var key = kid is null ? null : keys.Find(kid);
        if (key is null) return Fail(JwtError.UnknownKey);
        if (key.Algorithm != alg) return Fail(JwtError.UnsupportedAlgorithm);   // blocks algorithm confusion

        // 3. Signature over the exact bytes received.
        var signingInput = Encoding.ASCII.GetBytes(parts[0] + "." + parts[1]);
        if (!key.Verify(signingInput, signature)) return Fail(JwtError.BadSignature);

        // 4. Claims, only now that they are authentic.
        if (GetString(payload, "iss") != _o.Issuer) return Fail(JwtError.WrongIssuer);
        if (!HasAudience(payload, _o.Audience)) return Fail(JwtError.WrongAudience);

        var now = clock.GetUtcNow();
        if (!TryGetTime(payload, "exp", out var exp)) return Fail(JwtError.Malformed);   // exp is required
        if (now >= exp + _o.ClockSkew) return Fail(JwtError.Expired);
        if (TryGetTime(payload, "nbf", out var nbf) && now + _o.ClockSkew < nbf) return Fail(JwtError.NotYetValid);

        var iat = TryGetTime(payload, "iat", out var issued) ? issued : DateTimeOffset.MinValue;
        if (revocations.IsRevoked(GetString(payload, "jti"), GetString(payload, "sub"), iat)) return Fail(JwtError.Revoked);

        return new JwtValidationResult(JwtError.None, payload);
    }

    private static JwtValidationResult Fail(JwtError e) => new(e, default);

    private static JsonElement ParseSegment(string segment)
    {
        using var doc = JsonDocument.Parse(Base64Url.DecodeFromChars(segment));
        return doc.RootElement.Clone();
    }

    private static string? GetString(JsonElement obj, string name) =>
        obj.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static bool HasAudience(JsonElement payload, string audience)
    {
        if (!payload.TryGetProperty("aud", out var aud)) return false;
        return aud.ValueKind switch
        {
            JsonValueKind.String => aud.GetString() == audience,
            JsonValueKind.Array => aud.EnumerateArray().Any(a => a.ValueKind == JsonValueKind.String && a.GetString() == audience),
            _ => false,
        };
    }

    private static bool TryGetTime(JsonElement payload, string name, out DateTimeOffset value)
    {
        value = default;
        if (!payload.TryGetProperty(name, out var v) || v.ValueKind != JsonValueKind.Number || !v.TryGetInt64(out var seconds)) return false;
        value = DateTimeOffset.FromUnixTimeSeconds(seconds);
        return true;
    }
}
```

```csharp file=Tokens/JwtIssuer.cs
using System.Buffers.Text;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace BusPass.Tokens;

/// <summary>Demo issuer. In production this is your identity provider; only it holds the private key (ideally in an HSM or Key Vault).</summary>
public sealed class JwtIssuer(ECDsa privateKey, string kid, string issuer, TimeProvider clock)
{
    public string Issue(string subject, string audience, TimeSpan lifetime, string scope)
    {
        var now = clock.GetUtcNow();
        var header = new Dictionary<string, object> { ["alg"] = "ES256", ["typ"] = "at+jwt", ["kid"] = kid };
        var payload = new Dictionary<string, object>
        {
            ["iss"] = issuer, ["sub"] = subject, ["aud"] = audience, ["scope"] = scope,
            ["iat"] = now.ToUnixTimeSeconds(), ["nbf"] = now.ToUnixTimeSeconds(),
            ["exp"] = now.Add(lifetime).ToUnixTimeSeconds(), ["jti"] = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)),
        };
        var signingInput = Segment(header) + "." + Segment(payload);
        var signature = privateKey.SignData(Encoding.ASCII.GetBytes(signingInput), HashAlgorithmName.SHA256);
        return signingInput + "." + Base64Url.EncodeToString(signature);
    }

    private static string Segment(object value) => Base64Url.EncodeToString(JsonSerializer.SerializeToUtf8Bytes(value));
}
```

```csharp file=Tokens/BusPassBearerHandler.cs
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace BusPass.Tokens;

/// <summary>Wraps JwtValidator as an ASP.NET Core authentication scheme. Real apps use AddJwtBearer; this shows what it does.</summary>
public sealed class BusPassBearerHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger,
                                         UrlEncoder encoder, JwtValidator validator)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "BusPassBearer";

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var header = Request.Headers.Authorization.ToString();
        if (!header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) return Task.FromResult(AuthenticateResult.NoResult());

        var result = validator.Validate(header["Bearer ".Length..].Trim());
        if (!result.IsValid)
        {
            Context.Items["jwt_error"] = result.Error;
            return Task.FromResult(AuthenticateResult.Fail($"Token rejected: {result.Error}"));
        }

        var claims = new List<Claim>();
        foreach (var p in result.Payload.EnumerateObject())
        {
            if (p.Name == "scope" && p.Value.ValueKind == JsonValueKind.String)
                claims.AddRange(p.Value.GetString()!.Split(' ', StringSplitOptions.RemoveEmptyEntries).Select(s => new Claim("scope", s)));
            else if (p.Value.ValueKind is JsonValueKind.String or JsonValueKind.Number)
                claims.Add(new Claim(p.Name, p.Value.ToString()));
        }
        var identity = new ClaimsIdentity(claims, SchemeName, "sub", "role");
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName)));
    }

    protected override Task HandleChallengeAsync(AuthenticationProperties properties)
    {
        Response.StatusCode = StatusCodes.Status401Unauthorized;
        // RFC 6750: tell the client why, without leaking details.
        Response.Headers.WWWAuthenticate = Context.Items.ContainsKey("jwt_error") ? "Bearer error=\"invalid_token\"" : "Bearer";
        return Task.CompletedTask;
    }
}
```

```csharp file=Program.cs
using System.Security.Claims;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Authentication;
using BusPass.Tokens;

var builder = WebApplication.CreateBuilder(args);

// Demo key pair. Production: the private key stays in the identity provider / Key Vault; APIs only fetch the JWKS.
var signingKey = ECDsa.Create(ECCurve.NamedCurves.nistP256);
const string Kid = "pass-2026-10";
var jwks = JwksParser.ToJwks(Kid, signingKey);

var keyProvider = new InMemorySigningKeyProvider();
keyProvider.Replace(JwksParser.Parse(jwks));

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.Configure<JwtValidationOptions>(builder.Configuration.GetSection("Jwt"));
builder.Services.AddSingleton<ISigningKeyProvider>(keyProvider);
builder.Services.AddSingleton<InMemoryRevocationList>();
builder.Services.AddSingleton<IRevocationChecker>(sp => sp.GetRequiredService<InMemoryRevocationList>());
builder.Services.AddSingleton<JwtValidator>();
builder.Services.AddSingleton(sp => new JwtIssuer(signingKey, Kid, "https://pass.citybus.in", sp.GetRequiredService<TimeProvider>()));

builder.Services.AddAuthentication(BusPassBearerHandler.SchemeName)
    .AddScheme<AuthenticationSchemeOptions, BusPassBearerHandler>(BusPassBearerHandler.SchemeName, _ => { });
builder.Services.AddAuthorizationBuilder()
    .AddPolicy("pass.read", p => p.RequireAuthenticatedUser().RequireClaim("scope", "pass.read"));

var app = builder.Build();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/.well-known/jwks.json", () => Results.Content(jwks, "application/json"));

if (app.Environment.IsDevelopment())
    app.MapPost("/dev/token/{rider}", (string rider, JwtIssuer issuer) =>
        Results.Ok(new { access_token = issuer.Issue(rider, "pass-api", TimeSpan.FromMinutes(15), "pass.read") }));

app.MapGet("/pass", (ClaimsPrincipal user) => Results.Ok(new { rider = user.FindFirstValue("sub"), validUntil = "2026-10-31" }))
   .RequireAuthorization("pass.read");

app.MapPost("/riders/{rider}/revoke-all", (string rider, InMemoryRevocationList list) =>
{
    list.RevokeAllFor(rider);   // stolen phone: every existing token for this rider dies now
    return Results.NoContent();
}).RequireAuthorization("pass.read");   // in production: an admin or support policy

app.Run();
```

### The same thing with the framework

In a real service you use the JWT bearer handler (package `Microsoft.AspNetCore.Authentication.JwtBearer`), which downloads and caches the JWKS from the authority's discovery document. Set the parameters explicitly instead of trusting defaults:

```csharp
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(o =>
{
    o.Authority = "https://pass.citybus.in";      // discovery + JWKS, refreshed automatically
    o.Audience = "pass-api";
    o.MapInboundClaims = false;                   // keep "sub", "scope" names unchanged
    o.TokenValidationParameters = new TokenValidationParameters
    {
        ValidIssuer = "https://pass.citybus.in",
        ValidAudience = "pass-api",
        ValidAlgorithms = ["ES256"],              // allowlist
        ValidTypes = ["at+jwt"],                  // ID tokens can't be replayed as access tokens
        ClockSkew = TimeSpan.FromSeconds(30),     // default is 5 minutes
        RequireExpirationTime = true,
        RequireSignedTokens = true,
    };
    o.Events = new JwtBearerEvents
    {
        OnTokenValidated = async ctx =>
        {
            var revocations = ctx.HttpContext.RequestServices.GetRequiredService<IRevocationChecker>();
            var iat = DateTimeOffset.FromUnixTimeSeconds(long.Parse(ctx.Principal!.FindFirstValue("iat") ?? "0"));
            if (revocations.IsRevoked(ctx.Principal.FindFirstValue("jti"), ctx.Principal.FindFirstValue("sub"), iat))
                ctx.Fail("revoked");
        },
    };
});
```

## Bad design vs good design

**Bad:**

```csharp
// Reads the token without verifying it, trusts alg from the header, and puts PII in the payload.
var payload = JsonSerializer.Deserialize<Dictionary<string, object>>(
    Encoding.UTF8.GetString(Convert.FromBase64String(token.Split('.')[1])));
if ((string)payload["role"] == "admin") { /* ... */ }

var jwt = Sign(new { sub = "rider-42", phone = "+91 98xxxxxx21", aadhaar_last4 = "1234", role = "admin" },
               secret: "citybus123", expiresIn: TimeSpan.FromDays(365));
```

Problems: no signature check at all; a guessable HS256 secret that every API shares; a one-year lifetime that can't be revoked; personal data readable by anyone who sees the token (logs, proxies, analytics SDKs); and `role=admin` frozen for a year.

**Good:** ES256 with keys from a JWKS and rotation, a strict validation checklist, 15-minute access tokens plus refresh tokens, a per-user cutoff for "stolen phone", and only an opaque `sub` plus scopes in the token. Profile data is fetched from the API when needed.

:::callout type=mistake title="Don't parse with Convert.FromBase64String"
Base64url uses `-` and `_` and drops padding. `Convert.FromBase64String` throws on many valid tokens, and naive "fixes" (padding and replacing characters by hand) are a classic source of bugs. Use `System.Buffers.Text.Base64Url` (.NET 9+) or the library.
:::

:::callout type=tradeoff title="Validate at the gateway, the service, or both?"
Gateway-only validation is cheaper and centralises configuration, but anything that bypasses the gateway (a misrouted internal call, a compromised pod) reaches services with no checks. Validating in both places costs a few tens of microseconds per request with cached keys. For most systems "both" is the right default. Revocation lookups can live only in the services that need them.
:::

## Practical playground

The starter graph validates tokens at the gateway by calling the identity provider's introspection endpoint on every request, and the pass API trusts an `X-Rider-Id` header from the gateway. Redesign it: local JWT validation with a JWKS cache, validation in the API as well, a revocation store for stolen phones, and key rotation. Compare the load on the identity provider before and after.

:::playground type=hld title="City bus pass: token validation at 08:30"
```json
{
  "nodes": [
    { "id": "app", "type": "client", "label": "Rider app", "props": { "rps": 3000 } },
    { "id": "gw", "type": "api-gateway", "label": "Gateway (introspects every token)" },
    { "id": "idp", "type": "external", "label": "Pass identity service" },
    { "id": "api", "type": "app-server", "label": "Pass API (trusts X-Rider-Id)", "props": { "instances": 4 } },
    { "id": "db", "type": "database", "label": "Passes DB" }
  ],
  "edges": [
    { "from": "app", "to": "gw", "kind": "sync", "label": "Bearer token" },
    { "from": "gw", "to": "idp", "kind": "sync", "label": "introspect per request" },
    { "from": "gw", "to": "api", "kind": "sync", "label": "X-Rider-Id header" },
    { "from": "api", "to": "db", "kind": "sync" }
  ]
}
```
:::

Things to work out: at 3,000 RPS, how many calls per second hit the identity service before and after your change? If the identity service is down for 10 minutes, what happens in each design? How quickly does a stolen-phone revocation take effect?

## Exercises

:::exercise id=m14-jwt-ex1 difficulty=beginner kind=code title="Decode a JWT (and prove decoding isn't validation)"
Write `JwtInspector`, which splits a compact JWT and decodes its header and payload to JSON strings, and reads a single string claim.
::requirements
- `Decode(token)` returns `(HeaderJson, PayloadJson)`.
- It must handle base64url: `-`, `_` and missing padding.
- A token without exactly three parts throws `FormatException`.
- `ReadStringClaim(token, name)` returns the claim value or null.
::acceptance
- The well-known jwt.io example token decodes to `{"alg":"HS256","typ":"JWT"}` and a payload with `"name":"John Doe"`.
- A payload whose base64url length needs padding decodes correctly.
- `"a.b"` throws `FormatException`.
- A forged token with a garbage signature still decodes. The tests make this point explicitly.
::hint
Split on `.` and check the count first.
::hint
Convert base64url to base64: replace `-` with `+` and `_` with `/`, then add `=` until the length is a multiple of 4.
::hint
`JsonDocument.Parse(payloadJson).RootElement.TryGetProperty(name, out var v)` reads one claim.
::hint
```csharp
var s = part.Replace('-', '+').Replace('_', '/');
s = s.PadRight(s.Length + (4 - s.Length % 4) % 4, '=');
return Encoding.UTF8.GetString(Convert.FromBase64String(s));
```
::starter
```csharp file=JwtInspector.cs
using System;
using System.Text;
using System.Text.Json;

public static class JwtInspector
{
    public static (string HeaderJson, string PayloadJson) Decode(string token) => throw new NotImplementedException();
    public static string? ReadStringClaim(string token, string name) => throw new NotImplementedException();
}
```
::tests
```csharp file=JwtInspectorTests.cs
using System;
using System.Text;
using Xunit;

public class JwtInspectorTests
{
    private const string JwtIo =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

    private static string B64Url(string json) =>
        Convert.ToBase64String(Encoding.UTF8.GetBytes(json)).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    [Fact]
    public void Decodes_header_and_payload()
    {
        var (h, p) = JwtInspector.Decode(JwtIo);
        Assert.Equal("{\"alg\":\"HS256\",\"typ\":\"JWT\"}", h);
        Assert.Contains("\"name\":\"John Doe\"", p);
    }

    [Fact]
    public void Handles_padding_and_url_alphabet()
    {
        var payload = "{\"sub\":\"rider-42\",\"note\":\"??>>\"}";   // produces '-' / '_' and needs padding
        var token = B64Url("{\"alg\":\"none\"}") + "." + B64Url(payload) + ".";
        Assert.Equal(payload, JwtInspector.Decode(token).PayloadJson);
    }

    [Fact]
    public void Reads_claims() => Assert.Equal("John Doe", JwtInspector.ReadStringClaim(JwtIo, "name"));

    [Fact]
    public void Missing_claim_is_null() => Assert.Null(JwtInspector.ReadStringClaim(JwtIo, "email"));

    [Fact]
    public void Wrong_shape_throws() => Assert.Throws<FormatException>(() => JwtInspector.Decode("a.b"));

    [Fact]
    public void Forged_token_still_decodes_so_decoding_proves_nothing()
    {
        var forged = B64Url("{\"alg\":\"HS256\"}") + "." + B64Url("{\"sub\":\"admin\"}") + ".garbage";
        Assert.Equal("admin", JwtInspector.ReadStringClaim(forged, "sub"));
    }
}
```
::solution
```csharp file=JwtInspector.cs
using System;
using System.Text;
using System.Text.Json;

public static class JwtInspector
{
    public static (string HeaderJson, string PayloadJson) Decode(string token)
    {
        var parts = token.Split('.');
        if (parts.Length != 3) throw new FormatException("A compact JWS has exactly three parts.");
        return (FromBase64Url(parts[0]), FromBase64Url(parts[1]));
    }

    public static string? ReadStringClaim(string token, string name)
    {
        using var doc = JsonDocument.Parse(Decode(token).PayloadJson);
        return doc.RootElement.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
    }

    private static string FromBase64Url(string part)
    {
        var s = part.Replace('-', '+').Replace('_', '/');
        s = s.PadRight(s.Length + (4 - s.Length % 4) % 4, '=');
        return Encoding.UTF8.GetString(Convert.FromBase64String(s));
    }
}
```

The last test is the lesson: a token with the signature `garbage` decodes perfectly and says `sub = admin`. Code that decodes and then trusts is the most common JWT bug in the wild. Decoding is fine for debugging and logging (redact first). Anything that makes a decision must go through full validation. In .NET 9+, `Base64Url.DecodeFromChars` replaces the manual padding logic.
::mistakes
- `PadRight(s.Length + 4 - s.Length % 4)` adds four `=` when the length is already a multiple of 4.
- Splitting with `Split('.', 2)` and missing the signature part.
::extensions
Add `IsExpired(token, now)` and explain in a comment why it is safe for UI hints ("your session expires soon") but not for security decisions.
:::

:::exercise id=m14-jwt-ex2 difficulty=beginner kind=code title="HS256 signing and verification from scratch"
Implement HS256 with `System.Security.Cryptography`: sign a payload, and verify a token.
::requirements
- `Sign(payloadJson, key)` produces `base64url(header).base64url(payload).base64url(HMAC-SHA256(key, signingInput))` with header `{"alg":"HS256","typ":"JWT"}`.
- `Sign` rejects keys shorter than 32 bytes with `ArgumentException`.
- `Verify(token, key)` returns true only if the token has three parts, the header's `alg` is exactly `HS256`, and the signature matches using a constant-time comparison.
- `Verify` must never throw on garbage input. It returns false.
::acceptance
- The jwt.io example token verifies with the secret `your-256-bit-secret` (verification doesn't enforce key length, signing does).
- Sign → Verify round-trips.
- Changing one character of the payload makes verification fail.
- A token with `"alg":"none"` and an empty signature fails.
- A token signed with a different key fails.
::hint
The signing input is the ASCII bytes of the first two parts *as received*, joined with a dot. Don't re-serialise the JSON.
::hint
`HMACSHA256.HashData(key, data)` computes the MAC in one call.
::hint
Decode the received signature and compare it with `CryptographicOperations.FixedTimeEquals(expected, received)`.
::hint
Wrap decoding in `try/catch (FormatException)` and `JsonException` and return false.
::hint
```csharp
var input = Encoding.ASCII.GetBytes(parts[0] + "." + parts[1]);
var expected = HMACSHA256.HashData(key, input);
return CryptographicOperations.FixedTimeEquals(expected, FromB64Url(parts[2]));
```
::starter
```csharp file=Hs256.cs
using System;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

public static class Hs256
{
    public static string Sign(string payloadJson, byte[] key) => throw new NotImplementedException();
    public static bool Verify(string token, byte[] key) => throw new NotImplementedException();
}
```
::tests
```csharp file=Hs256Tests.cs
using System;
using System.Security.Cryptography;
using System.Text;
using Xunit;

public class Hs256Tests
{
    private const string JwtIo =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    private static readonly byte[] Key = RandomNumberGenerator.GetBytes(32);

    private static string B64Url(string s) =>
        Convert.ToBase64String(Encoding.UTF8.GetBytes(s)).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    [Fact]
    public void Known_vector_verifies() => Assert.True(Hs256.Verify(JwtIo, Encoding.UTF8.GetBytes("your-256-bit-secret")));

    [Fact]
    public void Round_trip()
    {
        var token = Hs256.Sign("{\"sub\":\"rider-42\",\"exp\":1760951800}", Key);
        Assert.Equal(3, token.Split('.').Length);
        Assert.True(Hs256.Verify(token, Key));
    }

    [Fact]
    public void Header_is_hs256() => Assert.StartsWith("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.", Hs256.Sign("{}", Key));

    [Fact]
    public void Tampered_payload_fails()
    {
        var parts = Hs256.Sign("{\"sub\":\"rider-42\"}", Key).Split('.');
        var tampered = parts[0] + "." + B64Url("{\"sub\":\"rider-43\"}") + "." + parts[2];
        Assert.False(Hs256.Verify(tampered, Key));
    }

    [Fact]
    public void Alg_none_fails()
    {
        var token = B64Url("{\"alg\":\"none\",\"typ\":\"JWT\"}") + "." + B64Url("{\"sub\":\"admin\"}") + ".";
        Assert.False(Hs256.Verify(token, Key));
    }

    [Fact]
    public void Wrong_key_fails() => Assert.False(Hs256.Verify(Hs256.Sign("{}", Key), RandomNumberGenerator.GetBytes(32)));

    [Fact]
    public void Garbage_returns_false() => Assert.False(Hs256.Verify("%%%.***.!!!", Key));

    [Fact]
    public void Short_key_rejected_for_signing() =>
        Assert.Throws<ArgumentException>(() => Hs256.Sign("{}", Encoding.UTF8.GetBytes("citybus123")));
}
```
::solution
```csharp file=Hs256.cs
using System;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

public static class Hs256
{
    private const string HeaderJson = "{\"alg\":\"HS256\",\"typ\":\"JWT\"}";

    public static string Sign(string payloadJson, byte[] key)
    {
        if (key.Length < 32) throw new ArgumentException("HS256 keys must be at least 256 bits.", nameof(key));
        var input = B64Url(Encoding.UTF8.GetBytes(HeaderJson)) + "." + B64Url(Encoding.UTF8.GetBytes(payloadJson));
        return input + "." + B64Url(HMACSHA256.HashData(key, Encoding.ASCII.GetBytes(input)));
    }

    public static bool Verify(string token, byte[] key)
    {
        var parts = token.Split('.');
        if (parts.Length != 3) return false;
        try
        {
            using var header = JsonDocument.Parse(FromB64Url(parts[0]));
            if (!header.RootElement.TryGetProperty("alg", out var alg) || alg.ValueKind != JsonValueKind.String ||
                alg.GetString() != "HS256") return false;

            var expected = HMACSHA256.HashData(key, Encoding.ASCII.GetBytes(parts[0] + "." + parts[1]));
            return CryptographicOperations.FixedTimeEquals(expected, FromB64Url(parts[2]));
        }
        catch (Exception e) when (e is FormatException or JsonException) { return false; }
    }

    private static string B64Url(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static byte[] FromB64Url(string s)
    {
        s = s.Replace('-', '+').Replace('_', '/');
        return Convert.FromBase64String(s.PadRight(s.Length + (4 - s.Length % 4) % 4, '='));
    }
}
```

Three details carry the security. **The signing input is the received text**, so a verifier never depends on how its JSON library would re-serialise the header. **The algorithm is pinned**: the method only knows HS256, so `none` and RS256 headers fail. **The comparison is constant-time**: `FixedTimeEquals` takes the same time whether the first byte or the last byte differs (it returns false immediately only if lengths differ, and the length is not secret).
::mistakes
- `Convert.ToBase64String(expected) == parts[2]`: string equality short-circuits on the first difference, leaking timing information.
- Accepting the algorithm from the header and branching on it. That is how `alg: none` bugs are born.
- Using `Encoding.UTF8.GetBytes(secretString)` with a human-chosen secret. Generate 32 random bytes and store them in a secret store.
::extensions
Add `exp` checking with an injected `TimeProvider`, then compare your code with exercise 3.
:::

:::exercise id=m14-jwt-ex3 difficulty=intermediate kind=code title="The full validation checklist"
Build `TokenValidator.Validate`, which applies the whole checklist to HS256 tokens signed with one of several keys identified by `kid`.
::requirements
- Return a `TokenCheck` enum value: `Valid`, `Malformed`, `BadAlgorithm`, `UnknownKey`, `BadSignature`, `WrongIssuer`, `WrongAudience`, `Expired`, `NotYetValid`.
- Checks run in this order: shape → alg allowlist (`HS256` only) → kid lookup → signature → `iss` → `aud` → `exp` → `nbf`.
- `aud` may be a string or an array of strings.
- `exp` is required. `nbf` is optional.
- A clock skew (from the options) is allowed on both `exp` and `nbf`.
::acceptance
- A good token is `Valid`.
- `exp` 20 s in the past with 30 s skew is `Valid`. 40 s in the past is `Expired`.
- `aud: ["billing", "pass-api"]` is accepted for audience `pass-api`.
- A token with a valid signature but `iss` `https://evil.example` is `WrongIssuer`.
- A token with no `exp` is `Malformed`.
- A token whose `kid` isn't in the key set is `UnknownKey`, even if its signature would match some other key.
::hint
Reuse the pieces from exercise 2. The new parts are the `kid` lookup and the claim checks.
::hint
Parse the payload with `JsonDocument` only after the signature check. Before that, nothing in it is trustworthy.
::hint
For `aud`, switch on `JsonValueKind`: `String` compares directly, `Array` uses `EnumerateArray().Any(...)`.
::hint
Compare times as Unix seconds: `now.ToUnixTimeSeconds() >= exp + skewSeconds` means expired.
::hint
```csharp
if (!keys.TryGetValue(kid, out var key)) return TokenCheck.UnknownKey;
var expected = HMACSHA256.HashData(key, Encoding.ASCII.GetBytes(parts[0] + "." + parts[1]));
if (!CryptographicOperations.FixedTimeEquals(expected, sig)) return TokenCheck.BadSignature;
```
::starter
```csharp file=TokenValidator.cs
using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

public enum TokenCheck { Valid, Malformed, BadAlgorithm, UnknownKey, BadSignature, WrongIssuer, WrongAudience, Expired, NotYetValid }

public sealed record ValidationOptions(string Issuer, string Audience, TimeSpan ClockSkew);

public sealed class TokenValidator
{
    private readonly IReadOnlyDictionary<string, byte[]> _keys;
    private readonly ValidationOptions _options;
    private readonly TimeProvider _clock;

    public TokenValidator(IReadOnlyDictionary<string, byte[]> keysByKid, ValidationOptions options, TimeProvider clock)
    {
        _keys = keysByKid; _options = options; _clock = clock;
    }

    public TokenCheck Validate(string token) => throw new NotImplementedException();
}
```
::tests
```csharp file=TokenValidatorTests.cs
using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using Xunit;

public sealed class FixedClock(DateTimeOffset now) : TimeProvider
{
    public override DateTimeOffset GetUtcNow() => now;
}

public static class T
{
    public static readonly DateTimeOffset Now = new(2026, 10, 20, 8, 30, 0, TimeSpan.Zero);
    public static readonly byte[] KeyA = Encoding.ASCII.GetBytes("key-a-0123456789abcdef0123456789ab");
    public static readonly byte[] KeyB = Encoding.ASCII.GetBytes("key-b-0123456789abcdef0123456789ab");
    public static long S(int offsetSeconds) => Now.AddSeconds(offsetSeconds).ToUnixTimeSeconds();

    static string B64(byte[] b) => Convert.ToBase64String(b).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    public static string Make(string header, string payload, byte[] key)
    {
        var input = B64(Encoding.UTF8.GetBytes(header)) + "." + B64(Encoding.UTF8.GetBytes(payload));
        return input + "." + B64(HMACSHA256.HashData(key, Encoding.ASCII.GetBytes(input)));
    }
    public static string Good(string? payload = null) => Make("{\"alg\":\"HS256\",\"kid\":\"a\"}",
        payload ?? $"{{\"iss\":\"https://pass.citybus.in\",\"aud\":\"pass-api\",\"sub\":\"rider-42\",\"exp\":{S(900)},\"nbf\":{S(-10)}}}", KeyA);

    public static TokenValidator V() => new(new Dictionary<string, byte[]> { ["a"] = KeyA },
        new ValidationOptions("https://pass.citybus.in", "pass-api", TimeSpan.FromSeconds(30)), new FixedClock(Now));
}

public class TokenValidatorTests
{
    [Fact] public void Good_token_is_valid() => Assert.Equal(TokenCheck.Valid, T.V().Validate(T.Good()));

    [Fact] public void Two_parts_is_malformed() => Assert.Equal(TokenCheck.Malformed, T.V().Validate("abc.def"));

    [Fact] public void Alg_none_is_bad_algorithm() =>
        Assert.Equal(TokenCheck.BadAlgorithm, T.V().Validate(T.Make("{\"alg\":\"none\",\"kid\":\"a\"}", "{}", T.KeyA)));

    [Fact] public void Unknown_kid() =>
        Assert.Equal(TokenCheck.UnknownKey, T.V().Validate(T.Make("{\"alg\":\"HS256\",\"kid\":\"b\"}", "{}", T.KeyB)));

    [Fact] public void Wrong_key_is_bad_signature() =>
        Assert.Equal(TokenCheck.BadSignature, T.V().Validate(T.Make("{\"alg\":\"HS256\",\"kid\":\"a\"}", "{}", T.KeyB)));

    [Fact] public void Wrong_issuer() => Assert.Equal(TokenCheck.WrongIssuer,
        T.V().Validate(T.Good($"{{\"iss\":\"https://evil.example\",\"aud\":\"pass-api\",\"exp\":{T.S(900)}}}")));

    [Fact] public void Wrong_audience() => Assert.Equal(TokenCheck.WrongAudience,
        T.V().Validate(T.Good($"{{\"iss\":\"https://pass.citybus.in\",\"aud\":\"hr-app\",\"exp\":{T.S(900)}}}")));

    [Fact] public void Audience_array_accepted() => Assert.Equal(TokenCheck.Valid,
        T.V().Validate(T.Good($"{{\"iss\":\"https://pass.citybus.in\",\"aud\":[\"billing\",\"pass-api\"],\"exp\":{T.S(900)}}}")));

    [Theory]
    [InlineData(-20, TokenCheck.Valid)]
    [InlineData(-40, TokenCheck.Expired)]
    public void Expiry_with_skew(int expOffset, TokenCheck expected) => Assert.Equal(expected,
        T.V().Validate(T.Good($"{{\"iss\":\"https://pass.citybus.in\",\"aud\":\"pass-api\",\"exp\":{T.S(expOffset)}}}")));

    [Fact] public void Missing_exp_is_malformed() => Assert.Equal(TokenCheck.Malformed,
        T.V().Validate(T.Good("{\"iss\":\"https://pass.citybus.in\",\"aud\":\"pass-api\"}")));

    [Fact] public void Not_yet_valid() => Assert.Equal(TokenCheck.NotYetValid,
        T.V().Validate(T.Good($"{{\"iss\":\"https://pass.citybus.in\",\"aud\":\"pass-api\",\"exp\":{T.S(900)},\"nbf\":{T.S(120)}}}")));
}
```
::solution
```csharp file=TokenValidator.cs
using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

public enum TokenCheck { Valid, Malformed, BadAlgorithm, UnknownKey, BadSignature, WrongIssuer, WrongAudience, Expired, NotYetValid }

public sealed record ValidationOptions(string Issuer, string Audience, TimeSpan ClockSkew);

public sealed class TokenValidator
{
    private readonly IReadOnlyDictionary<string, byte[]> _keys;
    private readonly ValidationOptions _options;
    private readonly TimeProvider _clock;

    public TokenValidator(IReadOnlyDictionary<string, byte[]> keysByKid, ValidationOptions options, TimeProvider clock)
    {
        _keys = keysByKid; _options = options; _clock = clock;
    }

    public TokenCheck Validate(string token)
    {
        var parts = token.Split('.');
        if (parts.Length != 3) return TokenCheck.Malformed;
        try
        {
            using var header = JsonDocument.Parse(FromB64Url(parts[0]));
            var h = header.RootElement;
            if (Str(h, "alg") != "HS256") return TokenCheck.BadAlgorithm;
            var kid = Str(h, "kid");
            if (kid is null || !_keys.TryGetValue(kid, out var key)) return TokenCheck.UnknownKey;

            var expected = HMACSHA256.HashData(key, Encoding.ASCII.GetBytes(parts[0] + "." + parts[1]));
            if (!CryptographicOperations.FixedTimeEquals(expected, FromB64Url(parts[2]))) return TokenCheck.BadSignature;

            using var payload = JsonDocument.Parse(FromB64Url(parts[1]));
            var p = payload.RootElement;
            if (Str(p, "iss") != _options.Issuer) return TokenCheck.WrongIssuer;
            if (!HasAudience(p)) return TokenCheck.WrongAudience;

            var now = _clock.GetUtcNow().ToUnixTimeSeconds();
            var skew = (long)_options.ClockSkew.TotalSeconds;
            if (!TryNum(p, "exp", out var exp)) return TokenCheck.Malformed;
            if (now >= exp + skew) return TokenCheck.Expired;
            if (TryNum(p, "nbf", out var nbf) && now + skew < nbf) return TokenCheck.NotYetValid;
            return TokenCheck.Valid;
        }
        catch (Exception e) when (e is FormatException or JsonException or InvalidOperationException) { return TokenCheck.Malformed; }
    }

    private bool HasAudience(JsonElement p) =>
        p.TryGetProperty("aud", out var aud) && aud.ValueKind switch
        {
            JsonValueKind.String => aud.GetString() == _options.Audience,
            JsonValueKind.Array => aud.EnumerateArray().Any(a => a.ValueKind == JsonValueKind.String && a.GetString() == _options.Audience),
            _ => false,
        };

    private static string? Str(JsonElement e, string name) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static bool TryNum(JsonElement e, string name, out long value)
    {
        value = 0;
        return e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number && v.TryGetInt64(out value);
    }

    private static byte[] FromB64Url(string s)
    {
        s = s.Replace('-', '+').Replace('_', '/');
        return Convert.FromBase64String(s.PadRight(s.Length + (4 - s.Length % 4) % 4, '='));
    }
}
```

The order is deliberate. Structural and algorithm checks are cheap and reject junk before any crypto. The `kid` is looked up in a dictionary you control, so it can't be used for path traversal or SQL injection. Claims are read only after the signature passes. In a real service, prefer the framework's `JsonWebTokenHandler` with `TokenValidationParameters`, which implements the same checklist and is maintained by people who track new attacks.
::alternatives
Return a result object with the error *and* the parsed claims, so callers don't parse the payload twice (as `JwtValidator` in the implementation section does).
::mistakes
- Checking `exp` before the signature. Harmless for correctness, but it means acting on unauthenticated data and leaks timing about which check failed.
- Treating a missing `exp` as "never expires".
- Comparing `aud` with `Contains` on the raw JSON string (`"pass-api-admin"` contains `pass-api`).
:::

:::exercise id=m14-jwt-ex4 difficulty=intermediate kind=sql ordered=true title="Revocation: deny list and per-user cutoffs"
The pass API keeps two revocation tables: `revoked_jti` (individual tokens, kept until they would expire) and `user_token_cutoff` (tokens for this user issued before `not_before` are invalid, used for "phone stolen"). The table `presented_token` holds a sample of tokens presented to the API.

At `2026-10-20 10:00:00+00`, return each presented token's `request_id` and a `status`: `'expired'` if `expires_at` is at or before that time; otherwise `'revoked'` if its `jti` is in the deny list; otherwise `'cutoff'` if it was issued before the user's cutoff; otherwise `'ok'`. Order by `request_id`.
::setup
```sql
CREATE TABLE revoked_jti (
  jti        text PRIMARY KEY,
  expires_at timestamptz NOT NULL
);
CREATE TABLE user_token_cutoff (
  user_id    text PRIMARY KEY,
  not_before timestamptz NOT NULL
);
CREATE TABLE presented_token (
  request_id int PRIMARY KEY,
  jti        text NOT NULL,
  user_id    text NOT NULL,
  issued_at  timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);
INSERT INTO revoked_jti VALUES
  ('a3', '2026-10-20 10:07:00+00'),
  ('a7', '2026-10-20 10:05:00+00'),
  ('old1', '2026-10-20 08:00:00+00');
INSERT INTO user_token_cutoff VALUES
  ('rider-5', '2026-10-20 09:58:00+00'),
  ('rider-6', '2026-10-20 09:55:00+00');
INSERT INTO presented_token VALUES
  (1, 'a1', 'rider-1', '2026-10-20 09:50:00+00', '2026-10-20 10:05:00+00'),
  (2, 'a2', 'rider-2', '2026-10-20 09:40:00+00', '2026-10-20 09:55:00+00'),
  (3, 'a3', 'rider-3', '2026-10-20 09:52:00+00', '2026-10-20 10:07:00+00'),
  (4, 'a4', 'rider-4', '2026-10-20 09:45:00+00', '2026-10-20 10:00:00+00'),
  (5, 'a5', 'rider-5', '2026-10-20 09:48:00+00', '2026-10-20 10:03:00+00'),
  (6, 'a6', 'rider-5', '2026-10-20 09:59:00+00', '2026-10-20 10:14:00+00'),
  (7, 'a7', 'rider-6', '2026-10-20 09:50:00+00', '2026-10-20 10:05:00+00');
```
::check
```sql
SELECT p.request_id,
       CASE
         WHEN p.expires_at <= timestamptz '2026-10-20 10:00:00+00' THEN 'expired'
         WHEN r.jti IS NOT NULL THEN 'revoked'
         WHEN c.not_before IS NOT NULL AND p.issued_at < c.not_before THEN 'cutoff'
         ELSE 'ok'
       END AS status
FROM presented_token p
LEFT JOIN revoked_jti r ON r.jti = p.jti
LEFT JOIN user_token_cutoff c ON c.user_id = p.user_id
ORDER BY p.request_id;
```
::acceptance
- Request 4 is `expired`: `exp` exactly equal to now counts as expired.
- Request 5 is `cutoff`, request 6 (same rider, issued after the cutoff, on the new phone) is `ok`.
- Request 7 is `revoked`: the deny list wins over the cutoff because it is checked first.
- Riders with no cutoff row are not filtered out.
::hint
Every presented token must appear in the result. Which join keeps rows with no match in the other table?
::hint
You need two `LEFT JOIN`s, one per revocation table.
::hint
A `CASE` expression evaluates its `WHEN` branches in order and stops at the first true one. Put them in the priority order given.
::hint
When the user has no cutoff row, `c.not_before` is `NULL`, and `p.issued_at < NULL` is `NULL`, not true, so the branch is skipped. Writing `c.not_before IS NOT NULL AND` makes that explicit.
::solution
```sql
SELECT p.request_id,
       CASE
         WHEN p.expires_at <= timestamptz '2026-10-20 10:00:00+00' THEN 'expired'
         WHEN r.jti IS NOT NULL THEN 'revoked'
         WHEN c.not_before IS NOT NULL AND p.issued_at < c.not_before THEN 'cutoff'
         ELSE 'ok'
       END AS status
FROM presented_token p
LEFT JOIN revoked_jti r ON r.jti = p.jti
LEFT JOIN user_token_cutoff c ON c.user_id = p.user_id
ORDER BY p.request_id;
```

In production these lookups run per request, so they live in Redis or an in-memory cache refreshed every few seconds, not in a SQL query. The SQL version is still useful for audits ("which requests did we accept that we should have rejected?") and for designing the data. Note that `old1` in `revoked_jti` expired at 08:00. It can be deleted with `DELETE FROM revoked_jti WHERE expires_at < now()`, run every few minutes, which keeps the deny list small: with 15-minute tokens, an entry never needs to live longer than 15 minutes. Cutoff rows can likewise be deleted once `not_before` is older than the maximum token lifetime.
::mistakes
- Using inner joins, which drop every token that isn't revoked: the opposite of what you want.
- Checking the cutoff with `<=`: a token issued at the exact cutoff instant on the *new* phone would be rejected. Pick one rule and apply it consistently in code and SQL.
- Never purging the deny list, so it grows forever and every lookup gets slower.
:::

:::exercise id=m14-jwt-ex5 difficulty=advanced kind=hld title="Offline-verifiable QR bus passes"
The city bus service has 2 million daily riders and 3,000 buses. Conductors carry handheld validators that scan a QR code on the rider's phone. Buses lose mobile coverage for up to 30 minutes at a time on some routes. Requirements:

- A scan must be accepted or rejected in under 300 ms, online or offline.
- A pass reported stolen must stop working within 10 minutes on buses that have coverage, and within 30 minutes of a bus regaining coverage.
- A screenshot of someone else's QR code must not work for more than 2 minutes.
- The rider app may also be offline when showing the pass.

Design the token format, keys, validation, revocation and estimates.
::acceptance
- Uses an asymmetric signature (ES256 is a good fit for QR size) and explains why HS256 would be dangerous on 3,000 handhelds.
- Explains how short-lived QR tokens are produced even when the phone is offline.
- Covers key rotation for validators that are sometimes offline.
- Describes the deny list sync to validators and its size.
- Shows estimates: scans per second, token issuance, deny list size, QR payload size.
::hint
If validators held an HMAC secret, what could someone do with one stolen handheld?
::hint
The phone can't fetch a new token every 2 minutes while offline. Could the phone itself sign something short-lived, using a key the server certified?
::hint
Think of two layers: a daily "pass credential" signed by the server, and a per-minute proof signed by the phone's own key (in the phone's secure hardware).
::hint
QR codes hold up to roughly 2,900 bytes at the lowest error correction level, but scan reliability drops as density rises. Aim for under 400 bytes.
::starter
```json
{
  "nodes": [
    { "id": "app", "type": "client", "label": "Rider app (shows static QR with pass id)" },
    { "id": "val", "type": "client", "label": "Bus validators (3,000)" },
    { "id": "api", "type": "app-server", "label": "Pass API" },
    { "id": "db", "type": "database", "label": "Passes DB" }
  ],
  "edges": [
    { "from": "val", "to": "api", "kind": "sync", "label": "look up pass id per scan" },
    { "from": "api", "to": "db", "kind": "sync" },
    { "from": "app", "to": "api", "kind": "sync" }
  ]
}
```
::solution
```json
{
  "nodes": [
    { "id": "app", "type": "client", "label": "Rider app (device key in secure enclave)" },
    { "id": "iss", "type": "app-server", "label": "Pass credential issuer (ES256, key in HSM)", "props": { "instances": 2 } },
    { "id": "hsm", "type": "external", "label": "HSM / Key Vault (signing keys)" },
    { "id": "db", "type": "database", "label": "Passes DB", "props": { "replicas": 1, "multiAz": true } },
    { "id": "jwks", "type": "cdn", "label": "JWKS + deny list bundle on CDN" },
    { "id": "val", "type": "client", "label": "Bus validators (3,000, offline-capable)" },
    { "id": "sync", "type": "app-server", "label": "Validator sync API" },
    { "id": "deny", "type": "cache", "label": "Deny list (Redis, by pass id)", "props": { "ttlSeconds": 86400 } },
    { "id": "scans", "type": "queue", "label": "Scan log upload queue" },
    { "id": "fraud", "type": "worker", "label": "Fraud analytics (same pass, two buses)" }
  ],
  "edges": [
    { "from": "app", "to": "iss", "kind": "sync", "label": "daily: device public key, get pass credential" },
    { "from": "iss", "to": "hsm", "kind": "sync", "label": "sign" },
    { "from": "iss", "to": "db", "kind": "sync" },
    { "from": "iss", "to": "deny", "kind": "async", "label": "stolen phone: add pass id" },
    { "from": "deny", "to": "jwks", "kind": "async", "label": "publish delta every minute" },
    { "from": "val", "to": "jwks", "kind": "sync", "label": "poll every 2 min when online" },
    { "from": "val", "to": "sync", "kind": "async", "label": "upload scans" },
    { "from": "sync", "to": "scans", "kind": "async" },
    { "from": "scans", "to": "fraud", "kind": "async" }
  ]
}
```

**Token design.** Two layers:

1. **Pass credential** (daily): an ES256-signed token from the server: `{iss, sub: pass id, pass_type, valid_until, cnf: device public key, exp: +26 h, kid}`. The `cnf` (confirmation) claim binds it to a key pair generated in the phone's secure hardware.
2. **Presentation proof** (per QR refresh, every 30 s): the phone signs `{pass credential hash, timestamp}` with its device private key. No network needed.

The QR contains both. The validator checks: the server's signature on the credential (with cached public keys), the credential hasn't expired, the device signature with the key in `cnf`, the timestamp is within ±2 minutes of the validator's clock, and the pass id isn't on the deny list. A screenshot fails after 2 minutes because the timestamp is signed, and the thief can't produce new proofs without the phone's private key.

**Why not HS256?** Every validator would hold the secret. One stolen handheld lets anyone mint unlimited passes for the whole city. With ES256, validators hold only public keys.

**Estimates (estimates).**

```text
Scans: 2 M riders × 2 trips = 4 M scans/day; peak hour ≈ 15 % → 600 k/hour ≈ 170 scans/s city-wide
Per validator at peak: 170 ÷ 3,000 ≈ 0.06/s, local ECDSA verify is a few ms on a handheld CPU (estimate)
Credential issuance: 2 M/day, most fetched 05:00–09:00 → 2 M ÷ 14,400 s ≈ 140/s, peak ×2 ≈ 280/s HSM signs
QR payload: credential ≈ 220 B + device signature 64 B + timestamp ≈ 300 B binary → base45/binary QR, fine
Deny list: say 20,000 stolen/cancelled passes active × 8-byte ids ≈ 160 KB full, deltas a few KB
```

**Revocation.** Stolen phone → pass id on the deny list → published as a signed delta every minute on the CDN → validators poll every 2 minutes when online. Worst case online ≈ 3–4 minutes, under the 10-minute target. Offline buses apply it within one poll of regaining coverage. The rider's new phone gets a new device key and a new credential. Deny entries expire when the credential's `exp` passes (26 hours), which keeps the list small.

**Key rotation.** Validators cache the JWKS with *both* current and next keys. The issuer publishes the next key 7 days before starting to sign with it, so even a validator offline for days has it. Old keys are kept for 26 hours after the switch (the credential lifetime).

**What breaks first.** HSM signing throughput in the morning rush (pre-issue credentials overnight to spread load), and validator clock drift (sync time from GPS or the network on each poll, and reject proofs if the validator's own clock hasn't synced for over 24 hours).

**Simpler alternative.** If all buses had reliable coverage, an online check (validator → API → Redis) with a rotating server-issued QR every 30 s would be simpler and give instant revocation. Offline validation is what forces signed tokens here.
::mistakes
- A static QR with a pass id: trivially screenshotted and shared.
- HS256 on validators, which turns every handheld into a pass printer.
- Long-lived credentials (a month) with no deny list sync, so stolen passes ride free all month.
:::

## Automated testing

**Unit tests for the validator.** Test every branch of the checklist with tokens you build in the test: wrong `alg`, `none`, unknown `kid`, tampered payload, wrong issuer, audience string and array, expiry on both sides of the skew, missing `exp`, `nbf` in the future, revoked `jti`, issued before the user cutoff. Use a `TimeProvider` subclass so tests never depend on the real clock. Exercises 2 and 3 show the pattern.

**Algorithm-confusion test.** Load an RSA key pair, take the *public* key bytes, and sign an HS256 token with them as the HMAC secret. Assert your validator rejects it. Keep this test forever; it guards against a future refactor that "simplifies" key handling.

**Key rotation test.** Start the provider with key A, issue a token with A, add key B, issue with B, then remove A. Assert: both tokens valid while both keys are present, and the A token rejected with `UnknownKey` after removal.

**Integration tests in ASP.NET Core.** With `WebApplicationFactory`, configure the JWT bearer options to trust a test signing key (`IssuerSigningKey = new ECDsaSecurityKey(testKey)` in a `PostConfigure`), mint tokens in the test and assert: no token → 401 with `WWW-Authenticate: Bearer`, expired → 401 with `error="invalid_token"`, missing scope → 403, valid → 200.

**Fuzzing.** Feed the validator random strings, truncated tokens, deeply nested JSON and huge tokens. It must return an error, never throw or hang. The `MaxTokenLength` check exists for this reason.

## Real-world application

- **Identity providers** (Microsoft Entra ID, Auth0, Okta, Keycloak, Google) issue RS256 or ES256 JWTs and publish JWKS endpoints with rotating keys. Entra ID, for example, rotates its signing keys periodically and documents that apps must not hard-code them.
- **API gateways** (Azure API Management's `validate-jwt` policy, NGINX, Envoy, Kong) validate JWTs at the edge with cached JWKS.
- **Kubernetes service account tokens** are JWTs, now short-lived and audience-bound ("projected tokens"), after earlier long-lived tokens proved hard to revoke.
- **Offline credentials** such as signed QR tickets, vaccination certificates (the EU Digital COVID Certificate used COSE, a binary cousin of JWS) and government document QR codes follow the same idea: asymmetric signatures checked offline, keys distributed in advance.
- **Webhooks** sometimes use JWTs to sign payloads; HMAC signatures are more common. See [Webhooks](#/lesson/m10-webhooks).

## Interview questions

:::interview
::q beginner
What are the three parts of a JWT and what protects it?
::a
Header (algorithm, key id, type), payload (claims such as `iss`, `sub`, `aud`, `exp`) and signature, each base64url-encoded and joined with dots. The signature over `header.payload` protects integrity and authenticity: anyone can read the token, but without the signing key nobody can change it undetected. It provides no confidentiality, so never put secrets or sensitive personal data in a JWS.
::q beginner
HS256 versus RS256: when would you use each?
::a
HS256 uses one shared secret to sign and verify, so every verifier can also mint tokens. It suits a single service that issues and checks its own tokens. RS256 (and ES256) sign with a private key and verify with a public key, so many APIs can verify without being able to mint. It suits identity providers and multi-service systems, and the public keys can be published via JWKS and rotated by `kid`.
::q intermediate
List what you validate on an incoming access token.
::a
Size and three-part structure; `alg` against an allowlist (never `none`); `kid` looked up in the trusted key set; the key's algorithm matches `alg`; signature over the exact received bytes; `iss` exact match; `aud` contains this API; `exp` in the future and `nbf` in the past with small skew; `typ` if you distinguish access tokens (`at+jwt`); then application claims such as scope or tenant; optionally revocation via `jti` or a per-user cutoff.
::q intermediate
Explain the algorithm confusion attack.
::a
A server expects RS256 and verifies with its RSA public key, but its library chooses the algorithm from the token header. The attacker sets `alg` to HS256 and computes an HMAC using the server's public key (which is public) as the secret. The library then runs HMAC verification with the same public key bytes, and the signature matches. Defence: pin algorithms per key, so an RSA key can only ever verify RS256, and use an allowlist.
::q advanced
How do you revoke JWTs?
::a
You can't un-sign them, so you bound or check them. Short access token lifetimes (5–15 minutes) plus refresh tokens checked at the issuer bound the exposure. For immediate effect, add a per-user cutoff ("tokens issued before T are invalid"), a `jti` deny list whose entries can be purged at each token's expiry, or a token version stored per user. These need a fast shared lookup (Redis, in-memory cache synced by pub/sub). If you need instant revocation on every call anyway, opaque tokens with cached introspection, or sessions, may be simpler and more honest.
::q advanced
Your access tokens have grown to 9 KB and some requests fail behind a proxy. What happened and how do you fix it?
::a
Someone put large claim sets (group ids, permission lists, profile data) into the token. Proxies and servers limit header sizes (commonly 8 KB per header line in nginx, and total header limits in Kestrel and IIS), and browser cookies are limited to about 4 KB. Fix: keep only identity and coarse scopes in the token, look up fine-grained permissions server-side (with caching), use group overage claims or app roles instead of every group, prefer ES256 for smaller signatures, and add a token-size check in CI or monitoring.
:::

## Summary and revision

**Key takeaways**

- A JWT (JWS) is `base64url(header).base64url(payload).base64url(signature)`. Encoded, not encrypted.
- Asymmetric algorithms (RS256, ES256) separate minting from verifying. HS256 lets every verifier mint.
- Validate everything, in order: shape, alg allowlist, kid in your key set, key/alg match, signature, iss, aud, exp, nbf, typ, your claims, revocation.
- Rotate keys via JWKS: publish, then sign, then retire after the longest token lifetime. Refetch on unknown `kid`, rate-limited.
- JWTs can't be recalled: use short lifetimes, refresh tokens, cutoffs and deny lists. Keep tokens small and free of personal data.

**Terminology**: JWT, JWS, JWE, base64url, claim, `iss`, `sub`, `aud`, `exp`, `nbf`, `iat`, `jti`, `kid`, JWKS, HS256, RS256, ES256, clock skew, algorithm confusion, deny list, `at+jwt`.

:::flashcards
Q: Is a JWT payload encrypted?
A: No. A JWS is only base64url-encoded and signed. Anyone can read it. Use JWE if you truly need encryption.
Q: What does the kid header do?
A: Identifies which key signed the token, so verifiers can pick the right public key from the JWKS during rotations.
Q: Why is HS256 risky with many verifying services?
A: Every verifier holds the secret, so any one compromised service can mint valid tokens for all of them.
Q: What is the alg none attack?
A: An unsigned token with alg none accepted by a library that trusts the header. Fix: an algorithm allowlist.
Q: Which claim stops a token for app A being accepted by API B?
A: aud (audience). API B must require its own identifier in aud.
Q: Three ways to revoke JWTs before expiry?
A: A jti deny list, a per-user issued-before cutoff, or switching to opaque tokens with introspection. Plus short lifetimes.
Q: How should JWKS caching handle an unknown kid?
A: Refetch the JWKS, but at most once every few minutes, so attackers can't force a fetch per request.
Q: Units of exp?
A: Seconds since the Unix epoch (UTC), not milliseconds.
:::

## Knowledge check

:::quiz pass=70
::q single
A developer reads `sub` from a JWT by base64-decoding the payload, without verifying the signature, to decide which account to show. What can an attacker do?
- [ ] Nothing, the token is signed
- [x] Edit the payload to any `sub` and see that account, since nothing checks the signature
- [ ] Only read their own account
- [ ] Cause a 500 error at most
> A signature only protects you if you verify it. Decoding without validation trusts attacker-controlled data.
::q single
Thirty microservices verify tokens from one identity provider. Which algorithm is the better choice?
- [ ] HS256 with one shared secret in every service
- [x] RS256 or ES256, with services fetching public keys from the JWKS
- [ ] `none`, since the network is internal
- [ ] HS512 for extra strength
> With asymmetric signatures, verifiers can't mint tokens. A compromise of one service doesn't let an attacker forge tokens for the others.
::q single
A token's `exp` was 20 seconds ago. Your clock skew allowance is 30 seconds. What should happen?
- [x] Accept it
- [ ] Reject it as expired
- [ ] Reject it as malformed
- [ ] Refresh it automatically
> Skew exists for small clock differences between servers. Keep it small (30–60 s) so it doesn't become a lifetime extension.
::q multi
Which measures help revoke a stolen access token before its expiry? (Select all that apply.)
- [x] A deny list keyed by `jti`
- [x] A per-user cutoff rejecting tokens issued before a time
- [ ] Deleting the token from the client's storage
- [x] Using opaque tokens with introspection instead
> Deleting it on the client does nothing if the attacker already has a copy.
::q single
The identity provider rotates to a new signing key. Some APIs start rejecting all new tokens with "unknown key". What is the most likely cause?
- [ ] The tokens are expired
- [x] The APIs cached the old JWKS and don't refetch on an unknown `kid`, or the provider started signing before publishing the new key
- [ ] The audience changed
- [ ] RS256 doesn't support rotation
> Rotation requires publishing first, and validators that refresh their key set (including on unknown `kid`, rate-limited).
::q single
Which is the safest way to compare an HMAC signature?
- [ ] `expectedBase64 == receivedBase64`
- [ ] `expected.SequenceEqual(received)`
- [x] `CryptographicOperations.FixedTimeEquals(expected, received)`
- [ ] Compare only the first 8 bytes for speed
> Ordinary comparisons stop at the first mismatch and leak timing information that can be used to forge a signature byte by byte.
::q single
Product wants to add the user's full address and all 150 permission names to the access token "to save database calls". Best response?
- [ ] Do it, JWTs have no size limit
- [x] Keep the token small: identity and coarse scopes only. Fetch details and fine-grained permissions server-side with caching
- [ ] Encrypt it with JWE and add everything
- [ ] Move it to a URL query parameter
> Large tokens break header limits, travel on every request, go stale and expose personal data to anyone who sees the token.
:::

## Completion criteria

You have finished this lesson when you can:

- [ ] Score at least 70 % on the knowledge check.
- [ ] Complete exercises 2 and 3 with all tests passing.
- [ ] Complete exercise 4 or 5 and compare with the solution.
- [ ] Recite the validation checklist in order and name the attack each step blocks.
- [ ] Explain to a colleague why a JWT can't simply be "logged out", and what you'd do instead.
