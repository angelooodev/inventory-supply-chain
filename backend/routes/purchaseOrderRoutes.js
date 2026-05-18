const express = require('express');

const {
    getPurchaseOrderByOrderId,
    getSupplierPurchaseOrder,
    signPurchaseOrder,
    signSupplierPurchaseOrder,
} = require('../controllers/purchaseOrderController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/order/:orderId', protect, getPurchaseOrderByOrderId);
router.post('/order/:orderId/sign', protect, signPurchaseOrder);
router.get('/supplier/:token', getSupplierPurchaseOrder);
router.post('/supplier/:token/sign', signSupplierPurchaseOrder);

module.exports = router;
