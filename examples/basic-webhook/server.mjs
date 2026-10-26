import { Buffer } from 'node:buffer';
import { log, error } from 'node:console';
import { createServer } from 'node:http';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const MAX_BODY_BYTES = 64 * 1024;

/** A local JSON receiver for trying ChaosPay; it stores no application state. */
export function createWebhookServer(onWebhook = log) {
  return createServer((request, response) => {
    function reply(status, payload, headers = {}) {
      response.writeHead(status, {
        'content-type': 'application/json',
        ...headers,
      });
      response.end(JSON.stringify(payload));
    }

    if (request.url?.split('?')[0] !== '/webhook') {
      reply(
        404,
        { error: 'Not found. Use POST /webhook.' },
        { connection: 'close' },
      );
      return;
    }
    if (request.method !== 'POST') {
      reply(
        405,
        { error: 'Method not allowed. Use POST /webhook.' },
        { allow: 'POST', connection: 'close' },
      );
      return;
    }

    let chunks = [];
    let bytes = 0;
    let tooLarge = false;
    request.on('data', (chunk) => {
      if (tooLarge) return;
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks = [];
        reply(
          413,
          { error: 'Request body exceeds 65536 bytes.' },
          { connection: 'close' },
        );
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (tooLarge) return;
      let payload;
      try {
        payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        reply(400, { error: 'Request body must contain valid JSON.' });
        return;
      }
      onWebhook(`Received webhook:\n${JSON.stringify(payload, null, 2)}`);
      reply(200, { received: true });
    });
    request.on('error', () => response.destroy());
  });
}

// Importing the factory in tests does not start a listener.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const server = createWebhookServer();
  server.on('error', (cause) => {
    error(`Cannot start example receiver: ${cause.message}`);
    process.exitCode = 1;
  });
  server.listen(3000, '127.0.0.1', () => {
    log(
      'Listening at http://127.0.0.1:3000/webhook (POST). Press Ctrl+C to stop.',
    );
  });
}
