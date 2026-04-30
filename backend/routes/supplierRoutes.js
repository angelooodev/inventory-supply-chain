const express = require('express');
const router = express.Router();
const { getSuppliers, createSupplier } = require('../controllers/supplierController');

router.route('/').get(getSuppliers).post(createSupplier);

module.exports = router;