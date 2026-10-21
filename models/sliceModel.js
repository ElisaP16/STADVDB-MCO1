const { pool } = require('../config/db');

const SLICE_SQL = `
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
GROUP BY p.year, d.sys_district_id, d.district_name
ORDER BY p.year, d.district_name`;

const OPERATIONS = {
    credit: {
        label: 'Credit transactions',
        value: 'CREDIT',
    },
    debit: {
        label: 'Debit transactions',
        value: 'DEBIT',
    },
};

const toNumbers = (rows) =>
    rows.map((r) => ({
        ...r,
        number_of_transactions: Number(r.number_of_transactions),
    }));

const isValidOperation = (id) => Object.prototype.hasOwnProperty.call(OPERATIONS, id);

exports.getOperations = () =>
    Object.entries(OPERATIONS).map(([id, { label }]) => ({ id, label }));

exports.isValidOperation = isValidOperation;

exports.run = async (operationId) => {
    const op = OPERATIONS[operationId];
    if (!op) {
        return null;
    }
    const [rows] = await pool.query(SLICE_SQL, [op.value]);
    const normalized = toNumbers(rows);
    return {
        columns: ['year', 'district_name', 'number_of_transactions'],
        rows: normalized,
    };
};

exports.OPERATIONS = OPERATIONS;
