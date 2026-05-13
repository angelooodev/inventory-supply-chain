const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
    getProducts,
    createProduct,
    updateProduct,
    deleteProduct,
} = require('../controllers/productController');

// Map the routes to the controller functions
router.route('/').get(getProducts).post(protect, createProduct);
router.route('/:id').put(protect, updateProduct).delete(protect, deleteProduct);

module.exports = router;
