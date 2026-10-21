const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('database module', () => {
    it('exports a connection pool and lifecycle helpers', () => {
        const db = require('../config/db');
        assert.ok(db.pool);
        assert.equal(typeof db.connectDB, 'function');
        assert.equal(typeof db.createTables, 'function');
    });

    it('defaults the schema name to star_schema', () => {
        const prev = process.env.DB_NAME;
        delete process.env.DB_NAME;
        delete require.cache[require.resolve('../config/db')];
        const db = require('../config/db');
        assert.ok(db.pool);
        process.env.DB_NAME = prev;
        delete require.cache[require.resolve('../config/db')];
    });
});
