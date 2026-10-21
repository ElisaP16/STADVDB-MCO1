const drilldown = require('../models/drilldownModel');

const runSelected = async (operationId) => {
    if (!drilldown.isValidOperation(operationId)) {
        return { error: 'Invalid drill-down operation.', rows: null, columns: [] };
    }
    try {
        const result = await drilldown.run(operationId);
        return { error: null, rows: result.rows, columns: result.columns };
    } catch (err) {
        console.error('Drill-down query failed:', err);
        return { error: 'The query failed. Please try again.', rows: null, columns: [] };
    }
};

exports.show = async (req, res, next) => {
    try {
        const operations = drilldown.getOperations();
        const defaultOp = 'year_to_quarter';
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

        res.render('query-2', { operations, operation, rows, columns, error });
    } catch (err) {
        next(err);
    }
};

exports.listOperations = (req, res) => {
    res.json({ operations: drilldown.getOperations() });
};

exports.runOperation = async (req, res) => {
    const operationId = req.body?.operation ?? req.query?.operation;
    if (!operationId || typeof operationId !== 'string') {
        return res.status(400).json({ error: 'Operation identifier is required.' });
    }
    if (!drilldown.isValidOperation(operationId)) {
        return res.status(400).json({ error: 'Invalid drill-down operation.' });
    }
    try {
        const result = await drilldown.run(operationId);
        res.json(result);
    } catch (err) {
        console.error('Drill-down API query failed:', err);
        res.status(500).json({ error: 'The query failed. Please try again.' });
    }
};
