const mongoose = require('mongoose');

const productSchema = mongoose.Schema(
    {
        name: { type: String, required: true },
        sku: { type: String, required: true, unique: true },
        category: { type: String, required: true },
        currentStock: { type: Number, required: true, default: 0 },
        reorderThreshold: { type: Number, required: true, default: 10 }, // This handles your low-stock alert requirement
        price: { type: Number, required: true },
        supplier: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'Supplier',
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Product', productSchema);