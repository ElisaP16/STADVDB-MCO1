const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const runIntegration = process.env.RUN_INTEGRATION === '1';

let liveDbReady = null;

async function ensureLiveDb(t) {
    if (liveDbReady === false) {
        t.skip('Live DB unavailable (see earlier diagnostic).');
        return false;
    }
    if (liveDbReady === true) {
        return true;
    }
    const { connectDB, createTables } = require('../app');
    try {
        await connectDB();
        await createTables();
        liveDbReady = true;
        return true;
    } catch (err) {
        liveDbReady = false;
        t.diagnostic(`Live DB unavailable: ${err.message}`);
        t.skip(`Live DB unavailable: ${err.message}`);
        return false;
    }
}

describe('MySQL integration (live star_schema)', { skip: !runIntegration }, () => {
    it('connects to the configured database', async (t) => {
        if (!(await ensureLiveDb(t))) return;
        const { pool } = require('../config/db');
        const [rows] = await pool.query('SELECT DATABASE() AS db');
        assert.equal(rows[0].db, process.env.DB_NAME || 'star_schema');
    });

    it('executes roll-up region aggregation', async (t) => {
        if (!(await ensureLiveDb(t))) return;
        const rollup = require('../models/rollupModel');
        const { rows } = await rollup.run('region');
        assert.ok(Array.isArray(rows));
        if (rows.length) {
            assert.ok('region' in rows[0]);
            assert.equal(typeof rows[0].number_of_transactions, 'number');
        }
    });

    it('executes drill-down year → quarter', async (t) => {
        if (!(await ensureLiveDb(t))) return;
        const drilldown = require('../models/drilldownModel');
        const { rows } = await drilldown.run('year_to_quarter');
        assert.ok(Array.isArray(rows));
        if (rows.length) {
            assert.ok('quarter' in rows[0]);
        }
    });
});

describe('MySQL integration status', { skip: runIntegration }, () => {
    it('skipped unless RUN_INTEGRATION=1 (mocked tests cover API without live DB)', () => {
        assert.ok(true);
    });
});
