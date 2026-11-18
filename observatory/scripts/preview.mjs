import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import worker from '../dist/worker.mjs';

const port = Number(process.env.PORT || 8787);
createServer(async (incoming, outgoing) => {
  try {
    const request = new Request(new URL(incoming.url, 'http://127.0.0.1:' + port), {
      method: incoming.method, headers: incoming.headers
    });
    const response = await worker.fetch(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).pipe(outgoing);
    else outgoing.end();
  } catch (error) {
    console.error(error);
    outgoing.writeHead(500).end('Preview error');
  }
}).listen(port, '127.0.0.1', () => console.log('http://127.0.0.1:' + port));
