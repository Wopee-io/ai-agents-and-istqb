// Static server for a built single-page app: unknown paths get index.html. Node only, no dependencies.
import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve as resolvePath, sep } from 'node:path'

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain',
}

// Resolves with the server once it listens, or with null when the port is already taken.
export function serve(folder, port) {
  const dist = resolvePath(folder)
  return new Promise((resolve, reject) => {
    if (!existsSync(join(dist, 'index.html'))) return reject(new Error(`no index.html in ${dist}`))
    const server = createServer((req, res) => {
      let file
      try {
        file = normalize(join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname)))
      } catch {
        res.writeHead(400).end('bad request')
        return
      }
      const inside = file === dist || file.startsWith(dist + sep)
      if (!inside || !existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html')
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' })
      createReadStream(file).pipe(res)
    })
    server.on('error', (err) => (err.code === 'EADDRINUSE' ? resolve(null) : reject(err)))
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}

// The page at the URL as text, or null when nothing answers there.
export const pageText = (url) => fetch(url, { signal: AbortSignal.timeout(2000) }).then((r) => r.text(), () => null)
