const express = require('express');
const router = express.Router();
const { createOrder, updateOrderStatus, updateOrderAccounting, getOrders } = require('../controllers/orderController');
const { protect } = require('../middleware/authMiddleware'); // Import the gatekeeper

router.route('/').get(protect, getOrders).post(protect, createOrder);
router.route('/:id').put(protect, updateOrderStatus);
router.route('/:id/accounting').put(protect, updateOrderAccounting);

module.exports = router;
