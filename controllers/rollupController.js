const rollup = require('../models/rollupModel');

const runSelected = async (operationId) => {
    if (!rollup.isValidOperation(operationId)) {
        return { error: 'Invalid roll-up operation.', rows: null, columns: [] };
    }
    try {
        const result = await rollup.run(operationId);
        return { error: null, rows: result.rows, columns: result.columns };
    } catch (err) {
        console.error('Roll-up query failed:', err);
        return { error: 'The query failed. Please try again.', rows: null, columns: [] };
    }
};

exports.show = async (req, res, next) => {
    try {
        const operations = rollup.getOperations();
        const defaultOp = operations[0]?.id || 'region';
        const operation = req.query.operation || defaultOp;

        let rows = null;
        let columns = [];
        let error = null;

        if (req.query.run) {
            const outcome = await runSelected(operation);
            error = outcome.error;
            rows = outcome.rows;
            columns = outcome.columns;
        }

        res.render('query-1', { operations, operation, rows, columns, error });
    } catch (err) {
        next(err);
    }
};

exports.listOperations = (req, res) => {
    res.json({ operations: rollup.getOperations() });
};

exports.runOperation = async (req, res) => {
    const operationId = req.body?.operation ?? req.query?.operation;
    if (!operationId || typeof operationId !== 'string') {
        return res.status(400).json({ error: 'Operation identifier is required.' });
    }
    if (!rollup.isValidOperation(operationId)) {
        return res.status(400).json({ error: 'Invalid roll-up operation.' });
    }
    try {
        const result = await rollup.run(operationId);
        res.json(result);
    } catch (err) {
        console.error('Roll-up API query failed:', err);
        res.status(500).json({ error: 'The query failed. Please try again.' });
    }
};
