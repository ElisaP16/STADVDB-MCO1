const router = require('express').Router();
const ctrl = require('../controllers/diceController');

router.get('/query-4', ctrl.show);

module.exports = router;