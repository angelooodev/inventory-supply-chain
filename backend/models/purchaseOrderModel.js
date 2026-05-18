const mongoose = require('mongoose');

const signatureSchema = new mongoose.Schema({
    signerName: { type: String, default: '' },
    imagePath: { type: String, default: '' },
    storageUrl: { type: String, default: '' },
    signedAt: { type: Date, default: null },
}, { _id: false });

const purchaseOrderSchema = new mongoose.Schema({
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
    poNumber: { type: String, required: true, unique: true },
    status: {
        type: String,
        enum: ['Awaiting Warehouse Manager Signature', 'Awaiting CEO Signature', 'Awaiting Supplier Signature', 'Supplier Signed'],
        default: 'Awaiting Warehouse Manager Signature',
    },
    expectedDeliveryDate: { type: Date, default: null },
    companyDocumentPath: { type: String, default: '' },
    finalDocumentPath: { type: String, default: '' },
    supplierSigningToken: { type: String, default: '' },
    supplierTokenExpiresAt: { type: Date, default: null },
    supplierRepresentativeName: { type: String, default: '' },
    emailSentAt: { type: Date, default: null },
    warehouseManagerSignature: { type: signatureSchema, default: () => ({}) },
    ownerSignature: { type: signatureSchema, default: () => ({}) },
    supplierSignature: { type: signatureSchema, default: () => ({}) },
}, { timestamps: true });

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);
