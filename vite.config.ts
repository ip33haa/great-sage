import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { spawn } from 'node:child_process';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite';
import { handleLine, handleTts, type SageEnv } from './server/sage.js';

const LOCAL_VOICEVOX_URL = 'http://127.0.0.1:50021';

/** Serves the same /api/sage/* handlers as the Vercel functions in api/, so the key stays server-side locally too. */
function sagePlugin(env: SageEnv, enginePath: string | undefined): Plugin {
  const readBody = (req: IncomingMessage) =>
    new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });

  const handler: Connect.NextHandleFunction = async (req, res: ServerResponse, next) => {
    const url = new URL(req.url ?? '', 'http://localhost');
    const route = url.pathname === '/api/sage/tts' ? handleTts : url.pathname === '/api/sage/line' ? handleLine : null;
    if (!route) return next();

    const method = req.method ?? 'GET';
    const body = method === 'GET' || method === 'HEAD' ? undefined : new Uint8Array(await readBody(req));
    const response = await route(new Request(url, { method, headers: req.headers as Record<string, string>, body }), env);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(Buffer.from(await response.arrayBuffer()));
  };

  /** Launches the VOICEVOX engine in the background if it is installed but not already running. */
  const startVoicevox = async () => {
    if (!enginePath || env.VOICEVOX_URL !== LOCAL_VOICEVOX_URL) return;
    try {
      await fetch(`${LOCAL_VOICEVOX_URL}/version`);
      return;
    } catch {
      // Not running yet.
    }
    console.log('[sage] starting VOICEVOX engine');
    spawn(enginePath, ['--host', '127.0.0.1', '--port', '50021'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  };

  return {
    name: 'zariah-api',
    configureServer: (server) => {
      void startVoicevox();
      server.middlewares.use(handler);
    },
    configurePreviewServer: (server) => {
      void startVoicevox();
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const sageEnv: SageEnv = {
    GEMINI_API_KEY: env.GEMINI_API_KEY,
    VOICEVOX_URL: env.VOICEVOX_URL || (env.VOICEVOX_ENGINE_PATH ? LOCAL_VOICEVOX_URL : undefined),
  };
  return {
    plugins: [react(), tailwindcss(), sagePlugin(sageEnv, env.VOICEVOX_ENGINE_PATH)],
    server: {
      host: true,
      port: 3100,
      strictPort: true,
    },
  };
});
