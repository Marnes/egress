import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { eventsApi } from './events.js';
import { createMcpApp } from './mcp.js';
import { playerApi } from './playerApi.js';

const app = new Hono();

app.route('/api', playerApi);
app.route('/api', eventsApi);
app.route('/', createMcpApp());

// Production only: `npm run dev` serves web/ through Vite instead, proxying these same paths.
app.use('/*', serveStatic({ root: '../web/dist' }));

const port = Number(process.env.PORT ?? 8787);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`egress server listening on http://localhost:${info.port}`);
});
