const { pool } = require('../config/db');

const TYPE_SQL = `
    SELECT p.year, d.district_name, ty.transaction_type,
           SUM(t.num_of_transactions) AS number_of_transactions
    FROM trans t
    JOIN period p   ON t.period_id = p.period_id
    JOIN district d ON t.sys_district_id = d.sys_district_id
    JOIN type ty    ON t.type_id = ty.type_id
    WHERE p.year IN (?, ?)
      AND d.district_name IN (?, ?)
      AND ty.transaction_type IN ('CREDIT', 'DEBIT')
    GROUP BY p.year, d.district_name, ty.transaction_type
    ORDER BY p.year, d.district_name, ty.transaction_type
`;

const KSYMBOL_SQL = `
    SELECT p.year, d.district_name, ty.k_symbol,
           SUM(t.num_of_transactions) AS number_of_transactions
    FROM trans t
    JOIN period p   ON t.period_id = p.period_id
    JOIN district d ON t.sys_district_id = d.sys_district_id
    JOIN type ty    ON t.type_id = ty.type_id
    WHERE p.year IN (?, ?)
      AND d.district_name IN (?, ?)
      AND ty.k_symbol IN (?, ?)
    GROUP BY p.year, d.district_name, ty.k_symbol
    ORDER BY p.year, d.district_name, ty.k_symbol
`;

// MySQL returns SUM() as a DECIMAL string; convert so the view can format it
const toNumbers = (rows) =>
    rows.map((r) => ({ ...r, number_of_transactions: Number(r.number_of_transactions) }));

exports.getOptions = async () => {
    const [years] = await pool.query('SELECT DISTINCT year FROM period ORDER BY year');
    const [districts] = await pool.query('SELECT district_name FROM district ORDER BY district_id');
    const [kSymbols] = await pool.query(
        "SELECT DISTINCT k_symbol FROM type WHERE k_symbol IS NOT NULL AND TRIM(k_symbol) <> '' ORDER BY k_symbol"
    );
    return {
        years: years.map((r) => String(r.year)),
        districts: districts.map((r) => r.district_name),
        kSymbols: kSymbols.map((r) => r.k_symbol),
    };
};

exports.diceByType = async (year1, year2, district1, district2) => {
    const [rows] = await pool.execute(TYPE_SQL, [Number(year1), Number(year2), district1, district2]);
    return toNumbers(rows);
};

exports.diceByKSymbol = async (year1, year2, district1, district2, k1, k2) => {
    const [rows] = await pool.execute(KSYMBOL_SQL, [Number(year1), Number(year2), district1, district2, k1, k2]);
    return toNumbers(rows);
};
