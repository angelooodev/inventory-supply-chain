const Order = require('../models/orderModel');
const Product = require('../models/productModel');

// @desc    Create new order
// @route   POST /api/orders
const createOrder = async (req, res) => {
    try {
        const order = await Order.create(req.body);
        res.status(201).json(order);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

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
            
            // Find the correct warehouse in the product's array
            const warehouseEntry = product.warehouses.find(w => w.name === order.warehouse);

            if (warehouseEntry) {
                if (order.orderType === 'Inbound') {
                    warehouseEntry.stock += order.quantity;
                } else {
                    warehouseEntry.stock -= order.quantity;
                }
                await product.save();
            }
        }

        res.status(200).json(order);
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