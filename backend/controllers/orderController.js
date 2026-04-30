const Order = require('../models/orderModel');
const Product = require('../models/productModel');

// @desc    Update order status and adjust stock
// @route   PUT /api/orders/:id
const updateOrderStatus = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });

        const oldStatus = order.status;
        const newStatus = req.body.status;
        order.status = newStatus;
        await order.save();

        // Stock Adjustment Logic: Only if status changes to 'Delivered'
        if (newStatus === 'Delivered' && oldStatus !== 'Delivered') {
            const product = await Product.findById(order.product);
            
            if (!product) {
                console.log("DEBUG: Product not found for ID:", order.product);
                return res.status(404).json({ message: 'Product not found' });
            }

            // 1. Find the correct warehouse
            const warehouseEntry = product.warehouses.find(w => w.name === order.warehouse);

            if (warehouseEntry) {
                if (order.orderType === 'Inbound') {
                    warehouseEntry.stock += order.quantity;
                    console.log(`DEBUG: Restocking ${order.quantity} units to ${order.warehouse}`);
                } else {
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
                console.log("DEBUG: Warehouse mismatch! Order says:", order.warehouse);
            }
        }

        res.status(200).json(order);
    } catch (error) {
        console.error("CRITICAL ERROR:", error.message);
        res.status(500).json({ message: error.message });
    }
};

// ... keep createOrder and getOrders as they were[cite: 3]
const createOrder = async (req, res) => {
    try {
        const order = await Order.create(req.body);
        res.status(201).json(order);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getOrders = async (req, res) => {
    try {
        const orders = await Order.find().populate('product').populate('supplier');
        res.status(200).json(orders);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { createOrder, updateOrderStatus, getOrders };