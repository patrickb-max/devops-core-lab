import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { MongoClient } from 'mongodb';

test('task lifecycle persists across API restart; invalid input and errors are traceable', { timeout: 30000 }, async () => {
  const port = '3199';
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 2000 });
  let child;
  let taskId;
  let logs = '';
  const start = async () => {
    child = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT: port, HOST: '127.0.0.1', MONGODB_URI: uri, ENABLE_DRILLS: 'true' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let startupError;
    child.on('error', error => { startupError = error; });
    child.stdout.on('data', bytes => { logs += bytes; });
    child.stderr.on('data', bytes => { logs += bytes; });
    for (let attempt = 0; attempt < 60; attempt++) {
      if (startupError) throw startupError;
      if (child.exitCode !== null) throw new Error('API exited: ' + logs);
      if (logs.includes('"kind":"startup"')) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('API did not start: ' + logs);
  };
  const stop = async () => {
    if (!child || child.exitCode !== null) return;
    const closed = once(child, 'exit');
    child.kill();
    await closed;
  };
  const call = (path, options) => fetch('http://127.0.0.1:' + port + path, options);
  try {
    await client.connect();
    await start();
    assert.equal((await call('/health/ready')).status, 200);
    assert.equal((await call('/tasks', { method: 'POST', body: '{bad json' })).status, 400);
    assert.equal((await call('/tasks', { method: 'POST', body: '{}' })).status, 400);
    let response = await call('/tasks', { method: 'POST', body: JSON.stringify({ title: 'CI task ' + Date.now() }) });
    assert.equal(response.status, 201);
    const created = await response.json();
    taskId = created.task.id;
    assert.equal(response.headers.get('x-request-id'), created.requestId);
    assert.equal(created.task.completed, false);
    response = await call('/tasks/' + taskId, { method: 'PATCH' });
    assert.equal((await response.json()).task.completed, true);
    await stop();
    logs = '';
    await start();
    assert.equal((await call('/health/ready')).status, 200);
    const stored = await client.db('devops_core_lab').collection('tasks').findOne({ id: taskId });
    assert.equal(stored.completed, true);
    assert.equal((await call('/tasks/' + taskId, { method: 'PATCH' })).status, 200);
    response = await call('/drills/error');
    const error = await response.json();
    assert.equal(response.status, 500);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.ok(logs.includes(error.requestId));
    assert.ok(logs.includes('Intentional practice error'));
  } finally {
    await stop();
    if (taskId) await client.db('devops_core_lab').collection('tasks').deleteOne({ id: taskId });
    await client.close();
  }
});
