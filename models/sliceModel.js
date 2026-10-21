const { pool } = require('../config/db');

const PERIOD_SQL = `
SELECT
    d.district_name,
    ty.action_done,
    SUM(t.num_of_transactions) AS number_of_transactions
FROM trans t
JOIN period p
    ON t.period_id = p.period_id
JOIN district d
    ON t.sys_district_id = d.sys_district_id
JOIN type ty
    ON t.type_id = ty.type_id
WHERE p.year = ?
GROUP BY
    d.district_name,
    ty.action_done
ORDER BY
    d.district_name,
    number_of_transactions DESC`;

const LOCATION_SQL = `
SELECT
    p.year,
    ty.action_done,
    SUM(t.num_of_transactions) AS number_of_transactions
FROM trans t
JOIN district d
    ON t.sys_district_id = d.sys_district_id
JOIN period p
    ON t.period_id = p.period_id
JOIN type ty
    ON t.type_id = ty.type_id
WHERE d.region = ?
GROUP BY
    p.year,
    ty.action_done
ORDER BY
    p.year,
    number_of_transactions DESC`;

const TYPE_SQL = `
SELECT
    p.year,
    d.district_name,
    SUM(t.num_of_transactions) AS number_of_transactions
FROM trans t
JOIN period p
    ON t.period_id = p.period_id
JOIN district d
    ON t.sys_district_id = d.sys_district_id
JOIN type ty
    ON t.type_id = ty.type_id
WHERE ty.transaction_type = ?
GROUP BY
    p.year,
    d.district_name
ORDER BY
    p.year,
    number_of_transactions DESC`;

const ACCOUNT_SQL = `
SELECT
    p.year,
    ty.action_done,
    d.district_name,
    SUM(t.num_of_transactions) AS number_of_transactions
FROM trans t
JOIN account a
    ON t.sys_account_ID = a.sys_account_ID
JOIN period p
    ON t.period_id = p.period_id
JOIN type ty
    ON t.type_id = ty.type_id
JOIN district d
    ON t.sys_district_id = d.sys_district_id
WHERE a.account_ID = ?
GROUP BY
    p.year,
    ty.action_done,
    d.district_name
ORDER BY
    p.year,
    number_of_transactions DESC`;

const OPERATIONS = {
    period: {
        label: 'Period',
        description: 'Fix a single year and view districts by action done.',
        field: 'year',
        sql: PERIOD_SQL,
    },
    location: {
        label: 'Location',
        description: 'Fix a single region and view years by action done.',
        field: 'region',
        sql: LOCATION_SQL,
    },
    type: {
        label: 'Transaction type',
        description: 'Fix credit or debit and view years by district.',
        field: 'transaction_type',
        sql: TYPE_SQL,
    },
    account: {
        label: 'Account',
        description: 'Fix a single account and view years by action done and district.',
        field: 'account_id',
        sql: ACCOUNT_SQL,
    },
};

const toNumbers = (rows) =>
    rows.map((r) => ({
        ...r,
        ...(r.number_of_transactions !== undefined
            ? { number_of_transactions: Number(r.number_of_transactions) }
            : {}),
    }));

const isValidOperation = (id) => Object.prototype.hasOwnProperty.call(OPERATIONS, id);

exports.getOperations = () =>
    Object.entries(OPERATIONS).map(([id, { label, description, field }]) => ({ id, label, description, field }));

exports.isValidOperation = isValidOperation;

exports.getOptions = async () => {
    const [years] = await pool.query('SELECT DISTINCT year FROM period ORDER BY year');
    const [regions] = await pool.query('SELECT DISTINCT region FROM district ORDER BY region');
    return {
        years: years.map((r) => String(r.year)),
        regions: regions.map((r) => r.region),
        types: ['CREDIT', 'DEBIT'],
    };
};

exports.run = async (operationId, value) => {
    const op = OPERATIONS[operationId];
    if (!op) {
        return null;
    }
    const [rows] = await pool.query(op.sql, [value]);
    const normalized = toNumbers(rows);
    return {
        columns: normalized.length ? Object.keys(normalized[0]) : [],
        rows: normalized,
    };
};

exports.OPERATIONS = OPERATIONS;
