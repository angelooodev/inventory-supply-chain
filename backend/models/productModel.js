const mongoose = require('mongoose');

const warehouseSchema = new mongoose.Schema({
    name: { type: String, required: true }, 
    stock: { type: Number, default: 0 }
});

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    sku: { type: String, required: true, unique: true },
    category: { type: String, required: true },
    warehouses: [warehouseSchema], // Multi-warehouse tracking
    reorderThreshold: { type: Number, default: 10 },
    price: { type: Number, required: true },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);