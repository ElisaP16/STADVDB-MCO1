const slice = require('../models/sliceModel');

const isValidValue = (operationId, value, options) => {
    if (operationId === 'period') return options.years.includes(value);
    if (operationId === 'location') return options.regions.includes(value);
    if (operationId === 'type') return options.types.includes(value);
    if (operationId === 'account') return /^\d+$/.test(value);
    return false;
};

const runSelected = async (operationId, value, options) => {
    if (!slice.isValidOperation(operationId)) {
        return { error: 'Invalid slice operation.', rows: null, columns: [] };
    }
    if (!isValidValue(operationId, value, options)) {
        return { error: 'The selected value is not valid.', rows: null, columns: [] };
    }
    try {
        const result = await slice.run(operationId, value);
        return { error: null, rows: result.rows, columns: result.columns };
    } catch (err) {
        console.error('Slice query failed:', err);
        return { error: 'The query failed. Please try again.', rows: null, columns: [] };
    }
};

exports.show = async (req, res, next) => {
    try {
        const operations = slice.getOperations();
        const options = await slice.getOptions();
        const defaultOp = operations[0]?.id || 'period';
        const operation = req.query.operation || defaultOp;

        const q = {
            year: req.query.year || options.years[0],
            region: req.query.region || options.regions[0],
            transaction_type: req.query.transaction_type || options.types[0],
            account_id: req.query.account_id || '',
        };

        let rows = null;
        let columns = [];
        let error = null;

        if (req.query.run) {
            const field = operations.find((op) => op.id === operation)?.field;
            const outcome = await runSelected(operation, q[field], options);
            error = outcome.error;
            rows = outcome.rows;
            columns = outcome.columns;
        }

        res.render('query-3', { operations, operation, options, q, rows, columns, error });
    } catch (err) {
        next(err);
    }
};
