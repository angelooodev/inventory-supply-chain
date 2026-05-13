const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { getSuppliers, createSupplier, updateSupplier, deleteSupplier } = require('../controllers/supplierController');

router.route('/').get(getSuppliers).post(protect, createSupplier);
router.route('/:id').put(protect, updateSupplier).delete(protect, deleteSupplier);

module.exports = router;
