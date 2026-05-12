const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
    quantity: { type: Number, required: true },
    warehouse: { type: String, required: true }, // e.g., "Warehouse A"
    orderType: { type: String, enum: ['Inbound', 'Outbound'], required: true },
    status: { type: String, enum: ['Pending', 'Shipped', 'Delivered'], default: 'Pending' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdByName: { type: String, trim: true },
    createdByRole: { type: String, enum: ['Manager', 'Staff', 'Unknown'], default: 'Unknown' }
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
