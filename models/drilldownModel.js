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
    SUM(t.num_of_transactions) AS number_of_transactions
FROM trans t
JOIN district d
    ON t.sys_district_id = d.sys_district_id
GROUP BY
    d.region,
    d.district_name
WITH ROLLUP`;

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
    p.quarter,
    SUM(t.num_of_transactions) AS number_of_transactions
FROM trans t
JOIN period p
    ON t.period_id = p.period_id
GROUP BY
    p.year,
    p.quarter
WITH ROLLUP`;

const QUARTER_TO_MONTH_SQL = `
SELECT
    p.year,
    p.quarter,
    p.month,
    SUM(t.num_of_transactions) AS number_of_transactions
FROM trans t
JOIN period p
    ON t.period_id = p.period_id
GROUP BY
    p.year,
    p.quarter,
    p.month
WITH ROLLUP`;

const MONTH_TO_DAY_SQL = `
SELECT
    p.year,
    p.quarter,
    p.month,
    p.day,
    p.day_name,
    SUM(t.num_of_transactions) AS number_of_transactions
FROM trans t
JOIN period p
    ON t.period_id = p.period_id
GROUP BY
    p.year,
    p.quarter,
    p.month,
    p.day,
    p.day_name
WITH ROLLUP`;

const OPERATIONS = {
    year: {
        label: 'Year',
        description: 'Top-level yearly transaction totals.',
        sql: YEAR_SQL,
    },
    year_to_quarter: {
        label: 'Quarter',
        description: 'Break yearly totals down by quarter.',
        sql: YEAR_TO_QUARTER_SQL,
    },
    quarter_to_month: {
        label: 'Month',
        description: 'Break quarters down by month.',
        sql: QUARTER_TO_MONTH_SQL,
    },
    month_to_day: {
        label: 'Day',
        description: 'Break months down to individual days and weekdays.',
        sql: MONTH_TO_DAY_SQL,
    },
    region: {
        label: 'Region',
        description: 'Regional transaction totals.',
        sql: REGION_SQL,
    },
    region_to_district: {
        label: 'District',
        description: 'Break regional totals down to district level.',
        sql: DISTRICT_SQL,
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
