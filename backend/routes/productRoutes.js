const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
    getProducts,
    createProduct,
    downloadProductImportTemplate,
    importProducts,
    updateProduct,
    deleteProduct,
} = require('../controllers/productController');

// Map the routes to the controller functions
router.route('/').get(protect, getProducts).post(protect, createProduct);
router.route('/import-template').get(protect, downloadProductImportTemplate);
router.route('/import').post(protect, importProducts);
router.route('/:id').put(protect, updateProduct).delete(protect, deleteProduct);

module.exports = router;
