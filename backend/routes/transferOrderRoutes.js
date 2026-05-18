const express = require('express');

const {
    getTransferOrderByOrderId,
    signTransferOrder,
} = require('../controllers/transferOrderController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/order/:orderId', protect, getTransferOrderByOrderId);
router.post('/order/:orderId/sign', protect, signTransferOrder);

module.exports = router;
