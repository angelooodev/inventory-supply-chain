const mongoose = require('mongoose');

const warehouseSchema = mongoose.Schema({
    name: { type: String, required: true, unique: true },
    address: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Warehouse', warehouseSchema);
