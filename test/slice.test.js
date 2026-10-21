const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../app');
const db = require('../config/db');
const slice = require('../models/sliceModel');

describe('slice model (mocked pool)', () => {
    let originalQuery;

    beforeEach(() => {
        originalQuery = db.pool.query.bind(db.pool);
    });

    afterEach(() => {
        db.pool.query = originalQuery;
    });

    it('has credit and debit operations', () => {
        const ids = slice.getOperations().map((o) => o.id);
        assert.deepEqual(ids, ['credit', 'debit']);
    });

    it('passes CREDIT or DEBIT to the query', async () => {
        const used = [];
        db.pool.query = async (sql, params) => {
            assert.match(sql, /WHERE ty\.transaction_type = \?/);
            used.push(params[0]);
            return [[{ year: 1996, district_name: 'Hl.m. Praha', number_of_transactions: '12' }]];
        };
        const result = await slice.run('credit');
        await slice.run('debit');
        assert.deepEqual(used, ['CREDIT', 'DEBIT']);
        assert.equal(result.rows[0].number_of_transactions, 12);
    });

    it('rejects unknown operations', () => {
        assert.equal(slice.isValidOperation('transfer'), false);
    });
});

describe('slice page', () => {
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
        const res = await request(app).get('/query-3');
        assert.equal(res.status, 200);
        assert.match(res.text, /Credit transactions/);
        assert.match(res.text, /Debit transactions/);
        assert.match(res.text, /Slice ready/);
    });

    it('renders a results table after run', async () => {
        db.pool.query = async () => [[{ year: 1997, district_name: 'Brno - mesto', number_of_transactions: '7' }]];
        const res = await request(app).get('/query-3?run=1&operation=debit');
        assert.match(res.text, /results-table/);
        assert.match(res.text, /Brno - mesto/);
    });

    it('shows an error for an invalid operation', async () => {
        const res = await request(app).get('/query-3?run=1&operation=bad');
        assert.match(res.text, /Invalid slice operation/);
    });

    it('shows an error when the database fails', async () => {
        db.pool.query = async () => {
            throw new Error('db unavailable');
        };
        const res = await request(app).get('/query-3?run=1&operation=credit');
        assert.match(res.text, /The query failed/);
    });
});
