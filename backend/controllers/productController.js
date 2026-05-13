const Product = require('../models/productModel');
const Supplier = require('../models/supplierModel');
const Warehouse = require('../models/warehouseModel');

const requireSuperAdmin = (req, res) => {
    if (!req.user || req.user.role !== 'SuperAdmin') {
        res.status(403).json({ message: 'Access Denied: Only the Super Admin can manage products.' });
        return false;
    }
    return true;
};

// @desc    Get all products
// @route   GET /api/products
const getProducts = async (req, res) => {
    try {
        const products = await Product.find().populate('supplier', 'name');
        
        // Add a virtual field for 'totalStock' and 'isLowStock' for the frontend
        const formattedProducts = products.map(p => {
            const total = p.warehouses.reduce((sum, wh) => sum + wh.stock, 0);
            return {
                ...p._doc,
                totalStock: total,
                isLowStock: total <= p.reorderThreshold
            };
        });
        
        res.status(200).json(formattedProducts);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Create a new product
// @route   POST /api/products
const createProduct = async (req, res) => {
    try {
        if (!requireSuperAdmin(req, res)) return;

        const { name, sku, category, reorderThreshold, price, supplier } = req.body;

        if (!name || !sku || !category || !price || !supplier) {
            return res.status(400).json({ message: 'Please add all required fields' });
        }

        const supplierExists = await Supplier.findById(supplier);
        if (!supplierExists) {
            return res.status(404).json({ message: 'Supplier not found' });
        }

        const existingProduct = await Product.findOne({ sku });
        if (existingProduct) {
            return res.status(400).json({ message: 'SKU already exists' });
        }

        const threshold = Math.max(0, Number(reorderThreshold) || 10);
        const productPrice = Number(price);

        const warehouseRecords = await Warehouse.find().sort({ name: 1 });
        if (warehouseRecords.length === 0) {
            return res.status(400).json({ message: 'No warehouses found. Please register warehouses first.' });
        }

        const initialWarehouses = warehouseRecords.map((warehouse) => ({ name: warehouse.name, stock: 0 }));

        const product = await Product.create({
            name,
            sku,
            category: category.trim(),
            warehouses: initialWarehouses,
            reorderThreshold: threshold,
            price: productPrice,
            supplier,
        });

        res.status(201).json(product);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update a product (e.g., updating stock levels)
// @route   PUT /api/products/:id
const updateProduct = async (req, res) => {
    try {
        if (!requireSuperAdmin(req, res)) return;

        const product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        const updatedProduct = await Product.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );

        res.status(200).json(updatedProduct);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Delete a product
// @route   DELETE /api/products/:id
const deleteProduct = async (req, res) => {
    try {
        if (!requireSuperAdmin(req, res)) return;

        const product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        await product.deleteOne();
        res.status(200).json({ id: req.params.id, message: 'Product deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getProducts,
    createProduct,
    updateProduct,
    deleteProduct,
};
