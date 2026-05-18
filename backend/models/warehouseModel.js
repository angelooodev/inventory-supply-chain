const mongoose = require('mongoose');

const warehouseSchema = mongoose.Schema({
    name: { type: String, required: true, unique: true },
    address: { type: String, default: '' },
    manager: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
        unique: true,
        sparse: true,
    },
}, { timestamps: true });

module.exports = mongoose.model('Warehouse', warehouseSchema);
