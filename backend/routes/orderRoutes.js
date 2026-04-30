const express = require('express');
const router = express.Router();
const { createOrder, updateOrderStatus, getOrders } = require('../controllers/orderController');
const { protect } = require('../middleware/authMiddleware'); // Import the gatekeeper

router.route('/').get(protect, getOrders).post(protect, createOrder);
router.route('/:id').put(protect, updateOrderStatus);

module.exports = router;