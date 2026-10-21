const router = require('express').Router();
const ctrl = require('../controllers/rollupController');

router.get('/query-1', ctrl.show);
router.get('/api/rollup/operations', ctrl.listOperations);
router.post('/api/rollup/run', ctrl.runOperation);

module.exports = router;
