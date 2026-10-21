const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../app');
const db = require('../config/db');
const drilldown = require('../models/drilldownModel');

describe('drill-down model (mocked pool)', () => {
    let originalQuery;

    beforeEach(() => {
        originalQuery = db.pool.query.bind(db.pool);
    });

    afterEach(() => {
        db.pool.query = originalQuery;
    });

    it('returns predefined operations including time hierarchy levels', () => {
        const ops = drilldown.getOperations();
        assert.ok(ops.some((o) => o.id === 'year_to_quarter'));
        assert.ok(ops.some((o) => o.id === 'month_to_day'));
    });

    it('executes year → quarter SQL with quarter in GROUP BY', async () => {
        db.pool.query = async (sql) => {
            assert.match(sql, /GROUP BY p\.year, p\.quarter/);
            return [[{ year: 1996, quarter: 'Q1', number_of_transactions: '12' }]];
        };
        const result = await drilldown.run('year_to_quarter');
        assert.equal(result.rows[0].number_of_transactions, 12);
    });

    it('returns null for unknown operations', async () => {
        assert.equal(await drilldown.run('bogus'), null);
    });
});

describe('drill-down HTTP API', () => {
    let app;
    let originalQuery;

    beforeEach(() => {
        app = createApp();
        originalQuery = db.pool.query.bind(db.pool);
        db.pool.query = async () => [
            [{ year: 1996, quarter: 'Q1', number_of_transactions: '3' }],
        ];
    });

    afterEach(() => {
        db.pool.query = originalQuery;
    });

    it('lists available operations', async () => {
        const res = await request(app).get('/api/drilldown/operations');
        assert.equal(res.status, 200);
        assert.ok(res.body.operations.length >= 4);
    });

    it('runs a valid operation', async () => {
        const res = await request(app)
            .post('/api/drilldown/run')
            .send({ operation: 'year_to_quarter' });
        assert.equal(res.status, 200);
        assert.equal(res.body.rows[0].quarter, 'Q1');
    });

    it('rejects invalid operations', async () => {
        const res = await request(app).post('/api/drilldown/run').send({ operation: 'raw sql' });
        assert.equal(res.status, 400);
    });

    it('returns 500 on database errors', async () => {
        db.pool.query = async () => {
            throw new Error('db unavailable');
        };
        const res = await request(app)
            .post('/api/drilldown/run')
            .send({ operation: 'year_to_quarter' });
        assert.equal(res.status, 500);
    });
});

describe('drill-down page', () => {
    let app;
    let originalQuery;

    beforeEach(() => {
        app = createApp();
        originalQuery = db.pool.query.bind(db.pool);
    });

    afterEach(() => {
        db.pool.query = originalQuery;
    });

    it('renders setup controls and empty state', async () => {
        const res = await request(app).get('/query-2');
        assert.equal(res.status, 200);
        assert.match(res.text, /Drill-down operation/);
        assert.match(res.text, /Time hierarchy ready/);
    });

    it('renders results after run', async () => {
        db.pool.query = async () => [
            [{ year: 1996, quarter: 'Q2', number_of_transactions: '7' }],
        ];
        const res = await request(app).get('/query-2?run=1&operation=year_to_quarter');
        assert.match(res.text, /results-table/);
        assert.match(res.text, /Q2/);
    });
});
