const router = require('express').Router();
const ctrl = require('../controllers/sliceController');

router.get('/query-3', ctrl.show);

module.exports = router;
