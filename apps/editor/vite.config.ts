import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ContentConflictError, ContentValidationError, readWorkspace, saveWorkspace,
} from '@neon-divide/content/node';

const editorDirectory = dirname(fileURLToPath(import.meta.url));

function json(res: import('node:http').ServerResponse, status: number, value: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(value));
}

async function readBody(req: import('node:http').IncomingMessage) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 5_000_000) throw new Error('Request body is too large.');
  }
  return JSON.parse(body || '{}');
}

export function contentApi(): Plugin {
  return {
    name: 'neon-divide-content-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/project', async (req, res) => {
        if (req.method !== 'GET') return json(res, 405, { error: 'GET only' });
        try {
          return json(res, 200, await readWorkspace());
        } catch (error) {
          return json(res, 500, { error: error instanceof Error ? error.message : String(error) });
        }
      });
      server.middlewares.use('/api/save', async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });
        try {
          const { changes, revisions } = await readBody(req);
          const result = await saveWorkspace(changes, revisions);
          return json(res, 200, result);
        } catch (error) {
          if (error instanceof ContentConflictError) return json(res, 409, { error: error.message, code: error.code });
          if (error instanceof ContentValidationError) return json(res, 422, { error: error.message, code: error.code, issues: error.issues });
          return json(res, 500, { error: error instanceof Error ? error.message : String(error) });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), contentApi()],
  publicDir: resolve(editorDirectory, '../game/public'),
  server: {
    port: 5174,
    strictPort: true,
    fs: { allow: [resolve(editorDirectory, '../..')] },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
