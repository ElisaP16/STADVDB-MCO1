const router = require('express').Router();
const ctrl = require('../controllers/drilldownController');

router.get('/query-2', ctrl.show);
router.get('/api/drilldown/operations', ctrl.listOperations);
router.post('/api/drilldown/run', ctrl.runOperation);

module.exports = router;
