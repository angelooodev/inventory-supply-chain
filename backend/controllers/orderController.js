const Order = require('../models/orderModel');
const Product = require('../models/productModel');

const validateOrderQuantity = (quantity) => Number.isFinite(quantity) && quantity > 0;

const getWarehouseEntry = (product, warehouseName) => {
    return product.warehouses.find((warehouse) => warehouse.name === warehouseName);
};

// @desc    Update order status and adjust stock
// @route   PUT /api/orders/:id
const updateOrderStatus = async (req, res) => {
    try {
        if (!req.user || req.user.role === 'Staff') {
            return res.status(403).json({ message: 'Access Denied: Staff cannot update order status.' });
        }

        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });

        const oldStatus = order.status;
        const newStatus = req.body.status;
        const allowedStatuses = ['Pending', 'Shipped', 'Delivered', 'Cancelled'];

        if (!allowedStatuses.includes(newStatus)) {
            return res.status(400).json({ message: 'Invalid order status.' });
        }

        if (oldStatus === 'Delivered' && newStatus === 'Cancelled') {
            return res.status(400).json({ message: 'Delivered orders cannot be cancelled.' });
        }

        if (oldStatus === 'Cancelled' && newStatus === 'Delivered') {
            return res.status(400).json({ message: 'Cancelled orders cannot be delivered.' });
        }

        if (oldStatus === newStatus) {
            return res.status(200).json(order);
        }

        // Stock Adjustment Logic: Only if status changes to 'Delivered'
        if (newStatus === 'Delivered' && oldStatus !== 'Delivered') {
            const product = await Product.findById(order.product);
            
            if (!product) {
                console.log("DEBUG: Product not found for ID:", order.product);
                return res.status(404).json({ message: 'Product not found' });
            }

            // 1. Find the correct warehouse
            const warehouseEntry = getWarehouseEntry(product, order.warehouse);

            if (warehouseEntry) {
                if (order.orderType === 'Inbound') {
                    warehouseEntry.stock += order.quantity;
                    console.log(`DEBUG: Restocking ${order.quantity} units to ${order.warehouse}`);
                } else {
                    if (warehouseEntry.stock < order.quantity) {
                        return res.status(400).json({
                            message: `Cannot complete order. ${order.warehouse} only has ${warehouseEntry.stock} units available for ${product.name}.`
                        });
                    }
                    warehouseEntry.stock -= order.quantity;
                    console.log(`DEBUG: Deducting ${order.quantity} units for sale from ${order.warehouse}`);
                }

                // 2. RECALCULATE TOTAL STOCK
                // This ensures the main display updates correctly[cite: 3]
                product.totalStock = product.warehouses.reduce((acc, w) => acc + w.stock, 0);

                // 3. RECALCULATE LOW STOCK STATUS
                // This clears the pink alerts in your Notification Bell[cite: 3]
                product.isLowStock = product.totalStock <= 10; 

                // 4. Force Mongoose to save changes inside the array
                product.markModified('warehouses');
                await product.save();
                console.log("DEBUG: Database Save Successful. New Total:", product.totalStock);
            } else {
                return res.status(400).json({ message: `Warehouse ${order.warehouse} was not found for this product.` });
            }
        }

        order.status = newStatus;
        await order.save();

        res.status(200).json(order);
    } catch (error) {
        console.error("CRITICAL ERROR:", error.message);
        res.status(500).json({ message: error.message });
    }
};

// ... keep createOrder and getOrders as they were[cite: 3]
const createOrder = async (req, res) => {
    try {
        if (!req.user || req.user.role === 'Staff') {
            return res.status(403).json({ message: 'Access Denied: Staff cannot create orders.' });
        }

        const quantity = Number(req.body.quantity);
        if (!validateOrderQuantity(quantity)) {
            return res.status(400).json({ message: 'Quantity must be greater than 0.' });
        }

        if (req.body.orderType === 'Outbound') {
            const product = await Product.findById(req.body.product);

            if (!product) {
                return res.status(404).json({ message: 'Product not found' });
            }

            const warehouseEntry = getWarehouseEntry(product, req.body.warehouse);
            if (!warehouseEntry) {
                return res.status(400).json({ message: `Warehouse ${req.body.warehouse} was not found for this product.` });
            }

            if (warehouseEntry.stock < quantity) {
                return res.status(400).json({
                    message: `Cannot create order. ${req.body.warehouse} only has ${warehouseEntry.stock} units available for ${product.name}.`
                });
            }
        }

        const order = await Order.create({
            ...req.body,
            quantity,
            createdBy: req.user?._id,
            createdByName: req.user?.name || 'Unknown User',
            createdByRole: req.user?.role || 'Unknown',
        });
        res.status(201).json(order);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getOrders = async (req, res) => {
    try {
        const orders = await Order.find()
            .populate('product')
            .populate('supplier')
            .populate('createdBy', 'name role')
            .sort({ createdAt: -1 });
        res.status(200).json(orders);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { createOrder, updateOrderStatus, getOrders };
