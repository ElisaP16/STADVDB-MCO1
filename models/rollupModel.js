const { pool } = require('../config/db');

const REGION_SQL = `
SELECT
    d.region,
    SUM(t.num_of_transactions) AS number_of_transactions
FROM trans t
JOIN district d
    ON t.sys_district_id = d.sys_district_id
GROUP BY d.region
ORDER BY number_of_transactions DESC`;

const DISTRICT_SQL = `
SELECT
    d.region,
    d.district_name,
    SUM(t.num_of_transactions ) AS number_of_transactions
FROM trans t
JOIN district d
ON t.sys_district_id = d.sys_district_id
GROUP BY
    d.sys_district_id, 
    d.region,
    d.district_name
ORDER BY
    d.region,
    number_of_transactions DESC`;

const YEAR_SQL = `
SELECT
    p.year,
    SUM(t.num_of_transactions) AS number_of_transactions
FROM trans t
JOIN period p
    ON t.period_id = p.period_id
GROUP BY p.year
ORDER BY p.year`;

const YEAR_TO_QUARTER_SQL = `
SELECT
    p.year,
    SUM(t.num_of_transactions) AS number_of_transactions
FROM trans t
JOIN period p
    ON t.period_id = p.period_id
GROUP BY p.year
ORDER BY p.year`;

const OPERATIONS = {
    region: {
        label: 'District → Region',
        description: 'Roll district-level totals up to regional summaries.',
        sql: REGION_SQL,
    },
    district: {
        label: 'Region with districts',
        description: 'District-level detail grouped under each region (before rolling up to region only).',
        sql: DISTRICT_SQL,
    },
    year: {
        label: 'Period → Year',
        description: 'Aggregate transactions by calendar year.',
        sql: YEAR_SQL,
    },
    quarter_to_year: {
        label: 'Quarter → Year',
        description: 'Roll quarterly facts up to yearly totals.',
        sql: YEAR_TO_QUARTER_SQL,
    },
};

// MySQL returns SUM() as a DECIMAL string; convert so the view can format it
const toNumbers = (rows) =>
    rows.map((r) => ({
        ...r,
        ...(r.number_of_transactions !== undefined
            ? { number_of_transactions: Number(r.number_of_transactions) }
            : {}),
    }));

const isValidOperation = (id) => Object.prototype.hasOwnProperty.call(OPERATIONS, id);

exports.getOperations = () =>
    Object.entries(OPERATIONS).map(([id, { label, description }]) => ({ id, label, description }));

exports.isValidOperation = isValidOperation;

exports.run = async (operationId) => {
    const op = OPERATIONS[operationId];
    if (!op) {
        return null;
    }
    const [rows] = await pool.query(op.sql);
    const normalized = toNumbers(rows);
    return {
        columns: normalized.length ? Object.keys(normalized[0]) : [],
        rows: normalized,
    };
};

exports.OPERATIONS = OPERATIONS;
