// Minimal reproduction: fetch() sends lower-cased header names on Node.js 26,
// but preserves the casing on Node.js 24.
//
// Run with: NODE_EXTRA_CA_CERTS=cert.pem node repro.mjs
import { readFileSync } from 'node:fs'
import { createSecureServer } from 'node:http2'

// TLS server that accepts both HTTP/1.1 and HTTP/2 (like AWS API Gateway)
const server = createSecureServer(
	{
		key: readFileSync(new URL('./key.pem', import.meta.url)),
		cert: readFileSync(new URL('./cert.pem', import.meta.url)),
		allowHTTP1: true,
	},
	(req, res) => {
		// req.rawHeaders preserves header names exactly as received on the wire
		const names = req.rawHeaders.filter((_, i) => i % 2 === 0)
		res.setHeader('content-type', 'application/json')
		res.end(JSON.stringify({ httpVersion: req.httpVersion, names }))
	},
)

server.listen(0, async () => {
	const { port } = server.address()
	const res = await fetch(`https://localhost:${port}/`, {
		method: 'PATCH',
		headers: {
			'Content-Type': 'application/json',
			'If-Match': '1',
		},
		body: '{}',
	})
	const { httpVersion, names } = await res.json()
	console.log(`Node.js ${process.version} (undici ${process.versions.undici})`)
	console.log(`HTTP version: ${httpVersion}`)
	console.log('Header names received:', names.join(', '))
	console.log(
		names.includes('If-Match')
			? '=> casing preserved: "If-Match"'
			: names.includes('if-match')
				? '=> lower-cased: "if-match"'
				: '=> If-Match header not found',
	)
	server.close()
	process.exit(0)
})
