import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { defineConfig } from 'vite';

/**
 * Dev-only: lets the running game POST a framebuffer snapshot to disk.
 *
 * Useful for eyeballing the game without a display attached (and for automated
 * screenshot diffing later). Never part of a production build - `apply: 'serve'`
 * keeps it out of `vite build`.
 */
function snapshotEndpoint() {
  return {
    name: 'neon-divide-snapshot',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__shot', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('POST only');
          return;
        }
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          try {
            const { name = 'shot.png', data } = JSON.parse(body);
            const safe = name.replace(/[^\w.-]/g, '_');
            const out = resolve(server.config.root, '.shots', safe);
            mkdirSync(dirname(out), { recursive: true });
            writeFileSync(out, Buffer.from(data.split(',').pop(), 'base64'));
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ ok: true, path: out }));
          } catch (err) {
            res.statusCode = 500;
            res.end(String(err));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [snapshotEndpoint()],
  server: { port: 5173, open: false },
  build: {
    // Phaser is large; a single chunk keeps the output simple to serve.
    chunkSizeWarningLimit: 2000,
  },
});
