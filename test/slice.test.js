const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../app');
const db = require('../config/db');
const slice = require('../models/sliceModel');

const mockPool = (resultRows) => async (sql, params) => {
    if (/SELECT DISTINCT year/.test(sql)) return [[{ year: 1996 }, { year: 1997 }]];
    if (/SELECT DISTINCT region/.test(sql)) return [[{ region: 'Prague' }, { region: 'south Moravia' }]];
    return [resultRows];
};

describe('slice model (mocked pool)', () => {
    let originalQuery;

    beforeEach(() => {
        originalQuery = db.pool.query.bind(db.pool);
    });

    afterEach(() => {
        db.pool.query = originalQuery;
    });

    it('returns the four slice operations', () => {
        const ids = slice.getOperations().map((o) => o.id);
        assert.deepEqual(ids, ['period', 'location', 'type', 'account']);
    });

    it('slices on the matching column and passes the value', async () => {
        const expected = {
            period: /WHERE p\.year = \?/,
            location: /WHERE d\.region = \?/,
            type: /WHERE ty\.transaction_type = \?/,
            account: /WHERE a\.account_ID = \?/,
        };
        for (const [id, pattern] of Object.entries(expected)) {
            db.pool.query = async (sql, params) => {
                assert.match(sql, pattern);
                assert.deepEqual(params, ['x']);
                return [[{ year: 1996, number_of_transactions: '12' }]];
            };
            const result = await slice.run(id, 'x');
            assert.equal(result.rows[0].number_of_transactions, 12);
        }
    });

    it('returns null for unknown operations', async () => {
        const result = await slice.run('invalid_op', 'x');
        assert.equal(result, null);
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
        db.pool.query = mockPool([]);
        const res = await request(app).get('/query-3');
        assert.equal(res.status, 200);
        assert.match(res.text, /Slice dimension/);
        assert.match(res.text, /Slice ready/);
        assert.match(res.text, /south Moravia/);
    });

    it('renders a results table after run', async () => {
        db.pool.query = mockPool([{ year: 1997, district_name: 'Brno - mesto', number_of_transactions: '7' }]);
        const res = await request(app).get('/query-3?run=1&operation=type&transaction_type=DEBIT');
        assert.match(res.text, /results-table/);
        assert.match(res.text, /Brno - mesto/);
    });

    it('runs the account slice with a numeric id', async () => {
        db.pool.query = mockPool([{ year: 1996, action_done: 'x', district_name: 'Praha', number_of_transactions: '3' }]);
        const res = await request(app).get('/query-3?run=1&operation=account&account_id=2');
        assert.match(res.text, /results-table/);
    });

    it('rejects values that are not valid', async () => {
        db.pool.query = mockPool([]);
        const bad = await request(app).get('/query-3?run=1&operation=account&account_id=1%20OR%201');
        assert.match(bad.text, /not valid/);
        const bad2 = await request(app).get('/query-3?run=1&operation=period&year=2099');
        assert.match(bad2.text, /not valid/);
    });

    it('shows an error for invalid operation', async () => {
        db.pool.query = mockPool([]);
        const res = await request(app).get('/query-3?run=1&operation=bad');
        assert.match(res.text, /Invalid slice operation/);
    });

    it('shows an error when the query fails', async () => {
        db.pool.query = async (sql) => {
            if (/SELECT DISTINCT/.test(sql)) return [[{ year: 1996, region: 'Prague' }]];
            throw new Error('db unavailable');
        };
        const res = await request(app).get('/query-3?run=1&operation=type&transaction_type=CREDIT');
        assert.match(res.text, /The query failed/);
    });
});
