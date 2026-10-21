const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../app');
const db = require('../config/db');
const rollup = require('../models/rollupModel');

describe('roll-up model (mocked pool)', () => {
    let originalQuery;

    beforeEach(() => {
        originalQuery = db.pool.query.bind(db.pool);
    });

    afterEach(() => {
        db.pool.query = originalQuery;
    });

    it('returns predefined operations', () => {
        const ops = rollup.getOperations();
        assert.ok(ops.some((o) => o.id === 'region'));
        assert.ok(ops.some((o) => o.id === 'year'));
    });

    it('executes the region roll-up SQL', async () => {
        db.pool.query = async (sql) => {
            assert.match(sql, /GROUP BY d\.region/);
            return [[{ region: 'north Bohemia', number_of_transactions: '100' }]];
        };
        const result = await rollup.run('region');
        assert.deepEqual(result.rows[0].number_of_transactions, 100);
        assert.deepEqual(result.columns, ['region', 'number_of_transactions']);
    });

    it('returns null for unknown operations', async () => {
        const result = await rollup.run('invalid_op');
        assert.equal(result, null);
    });
});

describe('roll-up HTTP API', () => {
    let app;
    let originalQuery;

    beforeEach(() => {
        app = createApp();
        originalQuery = db.pool.query.bind(db.pool);
        db.pool.query = async () => [[{ region: 'test', number_of_transactions: '5' }]];
    });

    afterEach(() => {
        db.pool.query = originalQuery;
    });

    it('lists available operations', async () => {
        const res = await request(app).get('/api/rollup/operations');
        assert.equal(res.status, 200);
        assert.ok(res.body.operations.length >= 4);
    });

    it('runs a valid operation', async () => {
        const res = await request(app).post('/api/rollup/run').send({ operation: 'region' });
        assert.equal(res.status, 200);
        assert.equal(res.body.rows[0].number_of_transactions, 5);
    });

    it('rejects invalid operations', async () => {
        const res = await request(app).post('/api/rollup/run').send({ operation: 'drop tables' });
        assert.equal(res.status, 400);
    });

    it('returns 500 on database errors', async () => {
        db.pool.query = async () => {
            throw new Error('db unavailable');
        };
        const res = await request(app).post('/api/rollup/run').send({ operation: 'region' });
        assert.equal(res.status, 500);
    });
});

describe('roll-up page', () => {
    let app;
    let originalQuery;

    beforeEach(() => {
        app = createApp();
        originalQuery = db.pool.query.bind(db.pool);
    });

    afterEach(() => {
        db.pool.query = originalQuery;
    });

    it('renders setup controls', async () => {
        const res = await request(app).get('/query-1');
        assert.equal(res.status, 200);
        assert.match(res.text, /Roll-up operation/);
        assert.match(res.text, /Run Query/);
        assert.match(res.text, /Regional totals ready/);
    });

    it('renders a results table after run', async () => {
        db.pool.query = async () => [[{ region: 'Prague', number_of_transactions: '9' }]];
        const res = await request(app).get('/query-1?run=1&operation=region');
        assert.equal(res.status, 200);
        assert.match(res.text, /results-table/);
        assert.match(res.text, /Prague/);
    });

    it('shows an error for invalid operation on run', async () => {
        const res = await request(app).get('/query-1?run=1&operation=not_valid');
        assert.match(res.text, /Invalid roll-up operation/);
    });
});
