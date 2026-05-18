const mongoose = require('mongoose');

const paymentMethodSchema = mongoose.Schema(
    {
        methodType: { type: String, enum: ['bank_account', 'ewallet'], default: 'bank_account', required: true },
        providerCode: { type: String, required: true, trim: true },
        methodName: { type: String, required: true, trim: true },
        accountName: { type: String, required: true, trim: true },
        accountNumber: { type: String, required: true, trim: true },
        notes: { type: String, default: '', trim: true },
        isPrimary: { type: Boolean, default: false },
    },
    { _id: true }
);

const supplierSchema = mongoose.Schema(
    {
        name: { type: String, required: true },
        contactPerson: { type: String },
        email: { type: String, required: true, unique: true },
        phone: { type: String, required: true },
        address: { type: String },
        leadTimeDays: { type: Number, default: 7 },
        accountUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        paymentMethods: [paymentMethodSchema],
    },
    { timestamps: true }
);

module.exports = mongoose.model('Supplier', supplierSchema);
