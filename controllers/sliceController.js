const slice = require('../models/sliceModel');

const runSelected = async (operationId) => {
    if (!slice.isValidOperation(operationId)) {
        return { error: 'Invalid slice operation.', rows: null, columns: [] };
    }
    try {
        const result = await slice.run(operationId);
        return { error: null, rows: result.rows, columns: result.columns };
    } catch (err) {
        console.error('Slice query failed:', err);
        return { error: 'The query failed. Please try again.', rows: null, columns: [] };
    }
};

exports.show = async (req, res, next) => {
    try {
        const operations = slice.getOperations();
        const defaultOp = operations[0]?.id || 'credit';
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

        res.render('query-3', { operations, operation, rows, columns, error });
    } catch (err) {
        next(err);
    }
};
