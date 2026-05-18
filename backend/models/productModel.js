const mongoose = require('mongoose');
const { UNIT_OF_MEASURE_OPTIONS } = require('../constants/unitOfMeasure');

const warehouseSchema = new mongoose.Schema({
    name: { type: String, required: true }, 
    stock: { type: Number, default: 0 }
});

const supplierPricingSchema = new mongoose.Schema({
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
    cost: { type: Number, min: 0, required: true },
    updatedAt: { type: Date, default: Date.now },
}, { _id: false });

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    sku: { type: String, required: true, unique: true },
    category: { type: String, required: true },
    warehouses: [warehouseSchema], // Multi-warehouse tracking
    reorderThreshold: { type: Number, default: 10 },
    price: { type: Number, required: true },
    unitOfMeasure: { type: String, enum: UNIT_OF_MEASURE_OPTIONS, default: 'unit', required: true },
    suppliers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' }],
    supplierPricing: [supplierPricingSchema],
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);
