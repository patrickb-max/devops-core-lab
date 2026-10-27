import http from 'node:http';
import { randomUUID } from 'node:crypto';

import { MongoClient } from 'mongodb';
const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017', {
  serverSelectionTimeoutMS: 2000, connectTimeoutMS: 2000, socketTimeoutMS: 3000,
  heartbeatFrequencyMS: 1000, retryReads: false, retryWrites: false
});
const db = client.db('devops_core_lab');
const tasks = db.collection('tasks');
const ping = () => db.command({ ping: 1 });
const port = Number(process.env.PORT || 3100);
const drills = process.env.ENABLE_DRILLS === 'true';
let ready = true;
const server = http.createServer(async (req, res) => {
  const requestId = randomUUID();
  const start = performance.now();
  const path = new URL(req.url, 'http://localhost').pathname;
  res.setHeader('content-type', 'application/json');
  res.setHeader('x-request-id', requestId);
  const send = (status, data) => {
    res.writeHead(status);
    res.end(JSON.stringify({ ...data, requestId }));
  };
  res.on('finish', () => console.log(JSON.stringify({
    kind: 'access', service: 'core-lab', requestId, method: req.method,
    route: path.startsWith('/tasks/') ? '/tasks/:id' : path,
    statusCode: res.statusCode, durationMs: Math.round(performance.now() - start),
    time: new Date().toISOString(), version: process.env.APP_VERSION || 'local'
  })));
  try {
    if (req.method === 'GET' && path === '/health') return send(200, { status: 'alive' });
    if (req.method === 'GET' && path === '/health/ready') {
      try { if (!ready) throw new Error('Simulated outage'); await ping(); return send(200, { status: 'ready', dependency: 'mongodb' }); }
      catch { return send(503, { status: 'unavailable', dependency: 'mongodb' }); }
    }
    if (drills && req.method === 'POST' && path === '/drills/readiness') {
      ready = !ready;
      return send(200, { ready, simulated: true });
    }
    if (drills && req.method === 'GET' && path === '/drills/error') throw new Error('Intentional practice error');
    if (drills && req.method === 'GET' && path === '/drills/slow') {
      await new Promise(resolve => setTimeout(resolve, 2500));
      return send(200, { message: 'Intentional slow response' });
    }
    if (path.startsWith('/tasks') && !ready) return send(503, { error: 'SIMULATED_DEPENDENCY_UNAVAILABLE' });
    if (req.method === 'GET' && path === '/tasks') return send(200, { tasks: await tasks.find({}, { projection: { _id: 0 } }).limit(100).toArray() });
    if (req.method === 'POST' && path === '/tasks') {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 16384) return send(413, { error: 'BODY_TOO_LARGE' });
      }
      let input;
      try { input = JSON.parse(body); } catch { return send(400, { error: 'INVALID_JSON' }); }
      if (typeof input?.title !== 'string' || !input.title.trim() || input.title.length > 200) return send(400, { error: 'TITLE_REQUIRED_MAX_200' });
      const task = { id: randomUUID(), title: input.title.trim(), completed: false };
      await tasks.insertOne({ ...task });
      return send(201, { task });
    }
    if (req.method === 'PATCH' && /^\/tasks\/[^/]+$/.test(path)) {
      const task = await tasks.findOneAndUpdate({ id: path.split('/')[2] }, { $set: { completed: true } }, { returnDocument: 'after', projection: { _id: 0 } });
      if (!task) return send(404, { error: 'TASK_NOT_FOUND' });
      
      return send(200, { task });
    }
    send(404, { error: 'NOT_FOUND' });
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', kind: 'app', requestId, message: error.message }));
    const dependencyFailure = error.name.startsWith('Mongo');
    if (!res.headersSent) send(dependencyFailure ? 503 : 500, { error: dependencyFailure ? 'DATABASE_UNAVAILABLE' : 'INTERNAL_ERROR' });
  }
});
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(JSON.stringify({ kind: 'startup', port, drills })));
process.on('SIGTERM', () => server.close(async () => { await client.close(); }));
