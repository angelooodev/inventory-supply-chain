const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
    getSuppliers,
    createSupplier,
    updateSupplier,
    deleteSupplier,
    createOrUpdateSupplierAccount,
    getOwnSupplierProfile,
    updateOwnPaymentMethods,
} = require('../controllers/supplierController');

router.route('/').get(getSuppliers).post(protect, createSupplier);
router.get('/me', protect, getOwnSupplierProfile);
router.put('/me/payment-methods', protect, updateOwnPaymentMethods);
router.put('/:id/account', protect, createOrUpdateSupplierAccount);
router.route('/:id').put(protect, updateSupplier).delete(protect, deleteSupplier);

module.exports = router;
