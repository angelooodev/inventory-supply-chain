const mongoose = require('mongoose');

const supplierSchema = mongoose.Schema(
    {
        name: { type: String, required: true },
        contactPerson: { type: String },
        email: { type: String, required: true, unique: true },
        phone: { type: String, required: true },
        address: { type: String },
        leadTimeDays: { type: Number, default: 7 },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Supplier', supplierSchema);