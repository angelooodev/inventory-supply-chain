const mongoose = require('mongoose');

const signatureSchema = new mongoose.Schema({
    signerName: { type: String, default: '' },
    imagePath: { type: String, default: '' },
    storageUrl: { type: String, default: '' },
    signedAt: { type: Date, default: null },
}, { _id: false });

const transferOrderSchema = new mongoose.Schema({
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
    transferNumber: { type: String, required: true, unique: true },
    status: {
        type: String,
        enum: [
            'Awaiting Requesting Warehouse Manager Signature',
            'Awaiting Requested Warehouse Manager Signature',
            'Transfer Signed',
        ],
        default: 'Awaiting Requesting Warehouse Manager Signature',
    },
    requiredTransferDate: { type: Date, default: null },
    documentPath: { type: String, default: '' },
    finalDocumentPath: { type: String, default: '' },
    requestingWarehouseSignature: { type: signatureSchema, default: () => ({}) },
    requestedWarehouseSignature: { type: signatureSchema, default: () => ({}) },
}, { timestamps: true });

module.exports = mongoose.model('TransferOrder', transferOrderSchema);
