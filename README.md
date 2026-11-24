# `fetch()` sends lower-cased header names on Node.js 26

On Node.js 24, `fetch()` preserves the casing of request header names
(`If-Match`). On Node.js 26, the same request arrives as `if-match`.

The cause is the bundled undici: Node.js 26 ships undici 8, which negotiates
HTTP/2 via ALPN when the server supports it. HTTP/2 requires header names to
be lowercase ([RFC 9113, section 8.2.1](https://www.rfc-editor.org/rfc/rfc9113#section-8.2.1)).
Node.js 24 (undici 7) stays on HTTP/1.1, where the casing is sent as given.

The visible effect: anything that looks up a header with case-sensitive keys
(for example, `event.headers['If-Match']` in an AWS Lambda behind API Gateway,
which supports HTTP/2) stops finding it once clients upgrade to Node.js 26.

## Reproduce

Needs no dependencies. `cert.pem`/`key.pem` are a self-signed certificate for
`localhost`, used only by the local test server.

```bash
NODE_EXTRA_CA_CERTS=cert.pem node repro.mjs
```

[`repro.mjs`](repro.mjs) starts a local TLS server that accepts HTTP/1.1 and
HTTP/2 (like API Gateway), sends a `PATCH` with `If-Match: 1` using `fetch()`,
and prints the header names exactly as the server received them
(`req.rawHeaders`).

The [GitHub Actions workflow](.github/workflows/repro.yaml) runs it on
Node.js 24 and 26; compare the "Run reproduction" step of both jobs.

## Result

```
Node.js v24.22.2 (undici 7.30.1)
HTTP version: 1.1
Header names received: host, connection, Content-Type, If-Match, accept, accept-language, sec-fetch-mode, user-agent, pragma, cache-control, accept-encoding, content-length
=> casing preserved: "If-Match"

Node.js v26.13.1 (undici 8.12.4)
HTTP version: 2.0
Header names received: :authority, :method, :path, :scheme, content-type, if-match, accept, accept-language, sec-fetch-mode, user-agent, pragma, cache-control, accept-encoding, content-length
=> lower-cased: "if-match"
```

Over plain `http://` (no ALPN, so no HTTP/2), both versions preserve the casing.

## Fix on the server side

HTTP header names are case-insensitive. Look headers up case-insensitively,
for example by normalizing the keys with `new Headers(event.headers)` and then
calling `.get('if-match')`.
