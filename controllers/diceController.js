const dice = require('../models/diceModel');

exports.show = async (req, res, next) => {
    try {
        const options = await dice.getOptions();

        const q = {
            mode: req.query.mode === 'ksymbol' ? 'ksymbol' : 'type',
            year1: req.query.year1 || '1996',
            year2: req.query.year2 || '1997',
            district1: req.query.district1 || 'Hl.m. Praha',
            district2: req.query.district2 || 'Brno - mesto',
            k1: req.query.k1 || options.kSymbols[0],
            k2: req.query.k2 || options.kSymbols[1],
        };

        let rows = null;
        let error = null;

        if (req.query.run) {
            // Only accept values that actually exist in the database
            const valid =
                options.years.includes(q.year1) && options.years.includes(q.year2) &&
                options.districts.includes(q.district1) && options.districts.includes(q.district2) &&
                (q.mode === 'type' ||
                    (options.kSymbols.includes(q.k1) && options.kSymbols.includes(q.k2)));

            if (!valid) {
                error = 'One or more selected values are not valid.';
            } else {
                try {
                    rows = q.mode === 'type'
                        ? await dice.diceByType(q.year1, q.year2, q.district1, q.district2)
                        : await dice.diceByKSymbol(q.year1, q.year2, q.district1, q.district2, q.k1, q.k2);
                } catch (err) {
                    console.error('Dice query failed:', err);
                    error = 'The query failed. Please try again.';
                }
            }
        }

        res.render('query-4', { options, q, rows, error });
    } catch (err) {
        next(err); // e.g. the options lookup failed (DB down)
    }
};
