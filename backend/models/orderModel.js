const mongoose = require('mongoose');

const orderSchema = mongoose.Schema(
    {
        orderType: { type: String, enum: ['INBOUND', 'OUTBOUND'], required: true },
        product: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'Product',
        },
        quantity: { type: Number, required: true },
        status: {
            type: String,
            enum: ['PENDING', 'SHIPPED', 'DELIVERED', 'CANCELLED'],
            default: 'PENDING',
        },
        orderDate: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Order', orderSchema);