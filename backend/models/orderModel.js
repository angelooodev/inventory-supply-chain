const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null },
    quantity: { type: Number, required: true },
    warehouse: { type: String, required: true }, // e.g., "Warehouse A"
    sourceWarehouse: { type: String, default: '' },
    orderType: { type: String, enum: ['Inbound', 'Outbound', 'Transfer'], required: true },
    status: { type: String, enum: ['Pending', 'Shipped', 'Delivered', 'Cancelled'], default: 'Pending' },
    supplierUnitPrice: { type: Number, default: 0 },
    expenseAmount: { type: Number, default: 0 },
    customerUnitPrice: { type: Number, default: 0 },
    receivableAmount: { type: Number, default: 0 },
    accountingSettlementStatus: { type: String, enum: ['Open', 'InProgress', 'Settled', 'Failed'], default: 'Open' },
    accountingSettledAt: { type: Date, default: null },
    accountingSettledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    accountingSettledByName: { type: String, trim: true, default: '' },
    accountingProvider: { type: String, default: '' },
    accountingExternalId: { type: String, default: '' },
    accountingReferenceId: { type: String, default: '' },
    accountingExternalStatus: { type: String, default: '' },
    accountingFailureReason: { type: String, default: '' },
    accountingChannelCode: { type: String, default: '' },
    accountingChannelName: { type: String, default: '' },
    accountingPaymentMethodType: { type: String, default: '' },
    accountingPaymentMethodProvider: { type: String, default: '' },
    accountingPaymentMethodName: { type: String, default: '' },
    accountingPaymentMethodAccountName: { type: String, default: '' },
    accountingPaymentMethodAccountNumberMasked: { type: String, default: '' },
    disbursementHistory: [
        {
            action: { type: String, default: 'DISBURSE' },
            status: { type: String, default: '' },
            provider: { type: String, default: '' },
            payoutId: { type: String, default: '' },
            referenceId: { type: String, default: '' },
            channelCode: { type: String, default: '' },
            channelName: { type: String, default: '' },
            amount: { type: Number, default: 0 },
            paymentMethodName: { type: String, default: '' },
            paymentMethodAccountName: { type: String, default: '' },
            paymentMethodAccountNumberMasked: { type: String, default: '' },
            failureReason: { type: String, default: '' },
            processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
            processedByName: { type: String, default: '' },
            createdAt: { type: Date, default: Date.now },
        }
    ],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdByName: { type: String, trim: true },
    createdByRole: { type: String, enum: ['SuperAdmin', 'Manager', 'Accountant', 'Staff', 'Supplier', 'Unknown'], default: 'Unknown' }
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
