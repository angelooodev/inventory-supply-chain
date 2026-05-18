const Order = require('../models/orderModel');
const Product = require('../models/productModel');
const Warehouse = require('../models/warehouseModel');
const Supplier = require('../models/supplierModel');
const PurchaseOrder = require('../models/purchaseOrderModel');
const TransferOrder = require('../models/transferOrderModel');
const {
    attachPurchaseOrdersToOrders,
    clearPurchaseOrderSignatureStorage,
    createPurchaseOrderForInboundOrder,
} = require('../utils/purchaseOrderService');
const {
    attachTransferOrdersToOrders,
    clearTransferOrderSignatureStorage,
    createTransferOrderForOrder,
} = require('../utils/transferOrderService');
const {
    createSupplierDisbursement,
    getPayoutById,
    createSupplierDisbursementCheckout,
    getInvoiceById,
} = require('../utils/xenditService');

const WAREHOUSE_A_NAME = 'Warehouse A';

const validateOrderQuantity = (quantity) => Number.isFinite(quantity) && quantity > 0;
const getSupplierUnitPriceForProduct = (product, supplierId) => {
    if (!product || !supplierId) return 0;

    const normalizedSupplierId = String(supplierId);
    const supplierPriceEntry = Array.isArray(product.supplierPricing)
        ? product.supplierPricing.find((entry) => String(entry?.supplier || '') === normalizedSupplierId)
        : null;

    return Number(supplierPriceEntry?.cost || 0);
};
const canManageAccounting = (user) => Boolean(user && ['SuperAdmin', 'Accountant'].includes(user.role));
const isEscrowSimulationEnabled = () => String(process.env.XENDIT_ESCROW_SIMULATION || 'true').trim().toLowerCase() !== 'false';
const maskAccountNumber = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized) return '';
    if (normalized.length <= 4) return normalized;
    return `${'*'.repeat(Math.max(0, normalized.length - 4))}${normalized.slice(-4)}`;
};
const getPrimarySupplierPaymentMethod = (supplier) => {
    const methods = Array.isArray(supplier?.paymentMethods) ? supplier.paymentMethods : [];
    if (!methods.length) return null;
    return methods.find((method) => method?.isPrimary) || methods[0];
};
const resolveCheckoutPaymentMethodFromSupplier = (supplier, requestedMethod) => {
    const primaryMethod = getPrimarySupplierPaymentMethod(supplier);
    const providerCode = String(primaryMethod?.providerCode || '').trim().toUpperCase();
    const methodType = String(primaryMethod?.methodType || '').trim().toLowerCase();
    const normalizedRequestedMethod = String(requestedMethod || '').trim().toLowerCase();

    if (providerCode === 'GCASH') return 'gcash';
    if (providerCode === 'MAYA' || providerCode === 'PAYMAYA') return 'maya';

    if (['gcash', 'maya', 'paymaya', 'card'].includes(normalizedRequestedMethod)) {
        return normalizedRequestedMethod === 'paymaya' ? 'maya' : normalizedRequestedMethod;
    }

    if (methodType === 'ewallet') {
        return 'gcash';
    }

    return '';
};
const resolveAccountingSettlementStatusFromPayout = (status) => {
    const normalizedStatus = String(status || '').trim().toUpperCase();
    if (!normalizedStatus) return 'InProgress';
    if (['SUCCEEDED'].includes(normalizedStatus)) return 'Settled';
    if (['FAILED', 'CANCELLED', 'REVERSED', 'COMPLIANCE_REJECTED'].includes(normalizedStatus)) return 'Failed';
    return 'InProgress';
};
const resolveAccountingSettlementStatusFromInvoice = (status) => {
    const normalizedStatus = String(status || '').trim().toUpperCase();
    if (!normalizedStatus) return 'InProgress';
    if (['PAID', 'SETTLED'].includes(normalizedStatus)) return 'Settled';
    if (['EXPIRED', 'FAILED', 'VOIDED'].includes(normalizedStatus)) return 'Failed';
    return 'InProgress';
};
const buildAccountingFailureReason = (payload = {}) => {
    const failureCode = String(payload.failureCode || '').trim();
    const errorMessage = String(payload.errorMessage || '').trim();
    if (failureCode && errorMessage) return `${failureCode}: ${errorMessage}`;
    return failureCode || errorMessage || '';
};
const appendDisbursementHistory = (order, entry) => {
    order.disbursementHistory = Array.isArray(order.disbursementHistory) ? order.disbursementHistory : [];
    order.disbursementHistory.push({
        action: entry.action || 'DISBURSE',
        status: entry.status || '',
        provider: entry.provider || '',
        payoutId: entry.payoutId || '',
        referenceId: entry.referenceId || '',
        channelCode: entry.channelCode || '',
        channelName: entry.channelName || '',
        amount: Number(entry.amount || 0),
        paymentMethodName: entry.paymentMethodName || '',
        paymentMethodAccountName: entry.paymentMethodAccountName || '',
        paymentMethodAccountNumberMasked: entry.paymentMethodAccountNumberMasked || '',
        failureReason: entry.failureReason || '',
        processedBy: entry.processedBy || null,
        processedByName: entry.processedByName || '',
        createdAt: new Date(),
    });
};
const buildEscrowSimulationReference = (orderId) => `escrow-sim-${orderId}-${Date.now()}`;

const getManagerWarehouseNames = async (user) => {
    if (!user || user.role !== 'Manager') {
        return null;
    }

    const assignedWarehouses = await Warehouse.find({ manager: user._id }).select('name').lean();
    return assignedWarehouses.map((warehouse) => warehouse.name);
};

const ensureManagerWarehouseAccess = async (user, warehouseName) => {
    const allowedWarehouseNames = await getManagerWarehouseNames(user);
    if (!allowedWarehouseNames) {
        return true;
    }

    return allowedWarehouseNames.includes(warehouseName);
};

const getWarehouseEntry = (product, warehouseName) => {
    return product.warehouses.find((warehouse) => warehouse.name === warehouseName);
};

const syncProductWarehouses = async (product) => {
    const warehouseRecords = await Warehouse.find().sort({ name: 1 }).lean();
    if (warehouseRecords.length === 0) {
        return product.warehouses || [];
    }

    const existingEntries = new Map(
        (product.warehouses || []).map((warehouse) => [warehouse.name, { name: warehouse.name, stock: warehouse.stock }])
    );

    let hasChanges = false;
    const normalizedWarehouses = warehouseRecords.map((warehouse) => {
        const existingEntry = existingEntries.get(warehouse.name);
        if (existingEntry) {
            return existingEntry;
        }

        hasChanges = true;
        return { name: warehouse.name, stock: 0 };
    });

    if (hasChanges) {
        product.warehouses = normalizedWarehouses;
        product.markModified('warehouses');
        await product.save();
    }

    return hasChanges ? normalizedWarehouses : (product.warehouses || []);
};

const recalculateProductTotals = async (product) => {
    product.totalStock = product.warehouses.reduce((acc, warehouse) => acc + warehouse.stock, 0);
    product.isLowStock = product.totalStock < (product.reorderThreshold ?? 10);
    product.markModified('warehouses');
    await product.save();
};

const canManageOrder = async (user, order) => {
    if (!user || ['Staff', 'Supplier', 'Accountant'].includes(user.role)) {
        return false;
    }

    if (user.role !== 'Manager') {
        return true;
    }

    const allowedWarehouseNames = await getManagerWarehouseNames(user);
    if (!allowedWarehouseNames) {
        return false;
    }

    return allowedWarehouseNames.includes(order.warehouse) || (order.sourceWarehouse && allowedWarehouseNames.includes(order.sourceWarehouse));
};

const normalizeOrderPayload = (body) => ({
    ...body,
    warehouse: body.warehouse?.trim() || '',
    sourceWarehouse: body.sourceWarehouse?.trim() || '',
});

// @desc    Update order status and adjust stock
// @route   PUT /api/orders/:id
const updateOrderStatus = async (req, res) => {
    try {
        if (!req.user || ['Staff', 'Supplier', 'Accountant'].includes(req.user.role)) {
            return res.status(403).json({ message: 'Access Denied: Only managers and the Super Admin can update order status.' });
        }

        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });

        if (!(await canManageOrder(req.user, order))) {
            return res.status(403).json({ message: 'Access Denied: You can only manage orders for your assigned warehouse.' });
        }

        const oldStatus = order.status;
        const newStatus = req.body.status;
        const allowedStatuses = ['Pending', 'Shipped', 'Delivered', 'Cancelled'];

        if (!allowedStatuses.includes(newStatus)) {
            return res.status(400).json({ message: 'Invalid order status.' });
        }

        if (oldStatus === 'Delivered' && newStatus === 'Cancelled') {
            return res.status(400).json({ message: 'Delivered orders cannot be cancelled.' });
        }

        if (oldStatus === 'Cancelled' && newStatus === 'Delivered') {
            return res.status(400).json({ message: 'Cancelled orders cannot be delivered.' });
        }

        if (oldStatus === newStatus) {
            return res.status(200).json(order);
        }

        if (newStatus === 'Delivered' && oldStatus !== 'Delivered') {
            if (order.orderType === 'Inbound') {
                if (req.user.role !== 'Manager') {
                    return res.status(403).json({ message: 'Only the warehouse manager can mark this restock as received.' });
                }

                const purchaseOrder = await PurchaseOrder.findOne({ order: order._id });
                if (
                    !purchaseOrder ||
                    purchaseOrder.status !== 'Supplier Signed'
                ) {
                    return res.status(400).json({ message: 'This restock must be signed by the Warehouse A manager, the CEO, and the supplier before it can be marked as received.' });
                }

                await clearPurchaseOrderSignatureStorage(purchaseOrder);
                await purchaseOrder.save();
            } else if (order.orderType === 'Transfer') {
                const transferOrder = await TransferOrder.findOne({ order: order._id });
                if (!transferOrder || transferOrder.status !== 'Transfer Signed') {
                    return res.status(400).json({ message: 'This stock transfer must be signed by both warehouse managers before it can be delivered.' });
                }

                await clearTransferOrderSignatureStorage(transferOrder);
                await transferOrder.save();
            }

            const product = await Product.findById(order.product);

            if (!product) {
                return res.status(404).json({ message: 'Product not found' });
            }

            await syncProductWarehouses(product);

            const targetWarehouseEntry = getWarehouseEntry(product, order.warehouse);
            if (!targetWarehouseEntry) {
                return res.status(400).json({ message: `Warehouse ${order.warehouse} was not found for this product.` });
            }

            if (order.orderType === 'Inbound') {
                targetWarehouseEntry.stock += order.quantity;
            } else if (order.orderType === 'Transfer') {
                const sourceWarehouseEntry = getWarehouseEntry(product, order.sourceWarehouse);

                if (!sourceWarehouseEntry) {
                    return res.status(400).json({ message: `Source warehouse ${order.sourceWarehouse} was not found for this product.` });
                }

                if (sourceWarehouseEntry.stock < order.quantity) {
                    return res.status(400).json({
                        message: `Cannot complete transfer. ${order.sourceWarehouse} only has ${sourceWarehouseEntry.stock} units available for ${product.name}.`
                    });
                }

                sourceWarehouseEntry.stock -= order.quantity;
                targetWarehouseEntry.stock += order.quantity;
            } else {
                if (targetWarehouseEntry.stock < order.quantity) {
                    return res.status(400).json({
                        message: `Cannot complete order. ${order.warehouse} only has ${targetWarehouseEntry.stock} units available for ${product.name}.`
                    });
                }

                targetWarehouseEntry.stock -= order.quantity;
            }

            await recalculateProductTotals(product);
        }

        order.status = newStatus;
        await order.save();

        res.status(200).json(order);
    } catch (error) {
        console.error('CRITICAL ERROR:', error.message);
        res.status(500).json({ message: error.message });
    }
};

const updateOrderAccounting = async (req, res) => {
    try {
        if (!canManageAccounting(req.user)) {
            return res.status(403).json({ message: 'Access Denied: Only the accountant and Super Admin can manage accounting records.' });
        }

        const order = await Order.findById(req.params.id).populate('supplier').populate('product');
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        if (order.status === 'Cancelled') {
            return res.status(400).json({ message: 'Cancelled orders are excluded from accounting actions.' });
        }

        if (order.accountingSettlementStatus === 'Settled' && String(req.body.action || '').trim().toUpperCase() !== 'REFRESH_DISBURSEMENT') {
            return res.status(400).json({ message: 'This accounting record has already been settled.' });
        }

        const action = String(req.body.action || '').trim().toUpperCase();

        if (order.orderType === 'Inbound') {
            if (order.status !== 'Delivered') {
                return res.status(400).json({ message: 'Supplier orders must be completed before they become accounts payable.' });
            }

            const purchaseOrder = await PurchaseOrder.findOne({ order: order._id });
            if (!purchaseOrder || purchaseOrder.status !== 'Supplier Signed') {
                return res.status(400).json({ message: 'This supplier order must be fully signed before it can be disbursed.' });
            }

            if (!['DISBURSE', 'RETRY_DISBURSEMENT', 'REFRESH_DISBURSEMENT', 'RELEASE_ESCROW'].includes(action)) {
                return res.status(400).json({ message: 'Invalid accounting action for a supplier payable.' });
            }

            if (!order.supplier) {
                return res.status(400).json({ message: 'This accounts payable entry has no linked supplier.' });
            }

            if (action !== 'REFRESH_DISBURSEMENT' && req.body.confirmed !== true) {
                return res.status(400).json({ message: 'Disbursement must be explicitly confirmed by the accountant or Super Admin.' });
            }

            if (action === 'REFRESH_DISBURSEMENT' && isEscrowSimulationEnabled() && order.accountingProvider !== 'Xendit Checkout') {
                return res.status(400).json({ message: 'Refresh status is not used in escrow simulation mode.' });
            }

            if (action === 'REFRESH_DISBURSEMENT' && order.accountingProvider === 'Xendit Checkout') {
                if (!order.accountingExternalId) {
                    return res.status(400).json({ message: 'No Xendit checkout exists yet for this payable.' });
                }

                const invoiceDetails = await getInvoiceById(order.accountingExternalId);
                const settlementStatus = resolveAccountingSettlementStatusFromInvoice(invoiceDetails.status);

                order.accountingSettlementStatus = settlementStatus;
                order.accountingExternalStatus = invoiceDetails.status;
                order.accountingFailureReason = '';

                if (settlementStatus === 'Settled') {
                    order.accountingSettledAt = new Date();
                    order.accountingSettledBy = req.user._id;
                    order.accountingSettledByName = req.user.name || '';
                } else {
                    order.accountingSettledAt = null;
                    order.accountingSettledBy = null;
                    order.accountingSettledByName = '';
                }

                appendDisbursementHistory(order, {
                    action,
                    status: invoiceDetails.status,
                    provider: 'Xendit Checkout',
                    payoutId: invoiceDetails.id,
                    referenceId: invoiceDetails.referenceId,
                    channelCode: order.accountingChannelCode,
                    channelName: order.accountingChannelName,
                    amount: Number(order.expenseAmount || 0),
                    paymentMethodName: order.accountingPaymentMethodName,
                    paymentMethodAccountName: order.accountingPaymentMethodAccountName,
                    paymentMethodAccountNumberMasked: order.accountingPaymentMethodAccountNumberMasked,
                    failureReason: '',
                    processedBy: req.user._id,
                    processedByName: req.user.name || '',
                });

                await order.save();

                const updatedOrder = await Order.findById(order._id)
                    .populate('product')
                    .populate('supplier')
                    .populate('createdBy', 'name role')
                    .populate('accountingSettledBy', 'name role');
                const ordersWithPurchaseOrders = await attachPurchaseOrdersToOrders([updatedOrder]);
                const ordersWithTransferOrders = await attachTransferOrdersToOrders(ordersWithPurchaseOrders);
                return res.status(200).json({
                    ...ordersWithTransferOrders[0],
                    checkoutUrl: settlementStatus === 'InProgress' ? invoiceDetails.checkoutUrl : '',
                });
            } else if (action === 'REFRESH_DISBURSEMENT' && !isEscrowSimulationEnabled()) {
                if (!order.accountingExternalId) {
                    return res.status(400).json({ message: 'No Xendit payout exists yet for this payable.' });
                }

                const payoutDetails = await getPayoutById(order.accountingExternalId);
                const settlementStatus = resolveAccountingSettlementStatusFromPayout(payoutDetails.status);
                const failureReason = buildAccountingFailureReason(payoutDetails);

                order.accountingSettlementStatus = settlementStatus;
                order.accountingExternalStatus = payoutDetails.status;
                order.accountingFailureReason = failureReason;
                order.accountingChannelCode = payoutDetails.channelCode || order.accountingChannelCode;
                order.accountingChannelName = payoutDetails.channelName || order.accountingChannelName;

                if (settlementStatus === 'Settled') {
                    order.accountingSettledAt = new Date();
                    order.accountingSettledBy = req.user._id;
                    order.accountingSettledByName = req.user.name || '';
                } else {
                    order.accountingSettledAt = null;
                    order.accountingSettledBy = null;
                    order.accountingSettledByName = '';
                }

                appendDisbursementHistory(order, {
                    action,
                    status: payoutDetails.status,
                    provider: 'Xendit',
                    payoutId: payoutDetails.id,
                    referenceId: payoutDetails.referenceId,
                    channelCode: payoutDetails.channelCode || order.accountingChannelCode,
                    channelName: payoutDetails.channelName || order.accountingChannelName,
                    amount: Number(order.expenseAmount || 0),
                    paymentMethodName: order.accountingPaymentMethodName,
                    paymentMethodAccountName: order.accountingPaymentMethodAccountName,
                    paymentMethodAccountNumberMasked: order.accountingPaymentMethodAccountNumberMasked,
                    failureReason,
                    processedBy: req.user._id,
                    processedByName: req.user.name || '',
                });
            } else {
                if (action === 'RETRY_DISBURSEMENT' && order.accountingSettlementStatus !== 'Failed') {
                    return res.status(400).json({ message: 'Only failed disbursements can be retried.' });
                }

                const paymentMethod = getPrimarySupplierPaymentMethod(order.supplier);

                if (!paymentMethod) {
                    return res.status(400).json({ message: 'The supplier does not have a saved payment method yet.' });
                }

                const supplierId = order.supplier?._id || order.supplier;
                const liveSupplierUnitPrice = getSupplierUnitPriceForProduct(order.product, supplierId);
                const resolvedSupplierUnitPrice = Number(order.supplierUnitPrice || 0) > 0
                    ? Number(order.supplierUnitPrice || 0)
                    : liveSupplierUnitPrice;
                const payoutAmount = Number(order.expenseAmount || 0) > 0
                    ? Number(order.expenseAmount || 0)
                    : (resolvedSupplierUnitPrice * Number(order.quantity || 0));
                if (!Number.isFinite(payoutAmount) || payoutAmount <= 0) {
                    return res.status(400).json({
                        message: 'Cannot disburse this payable yet. No supplier quote has been saved for this order, so the payable amount is still 0.',
                    });
                }

                if (resolvedSupplierUnitPrice > 0 && Number(order.supplierUnitPrice || 0) <= 0) {
                    order.supplierUnitPrice = resolvedSupplierUnitPrice;
                }

                if (payoutAmount > 0 && Number(order.expenseAmount || 0) <= 0) {
                    order.expenseAmount = payoutAmount;
                }

                const checkoutPaymentMethod = resolveCheckoutPaymentMethodFromSupplier(order.supplier, req.body.paymentMethod);

                if (action === 'DISBURSE' && checkoutPaymentMethod) {
                    const checkout = await createSupplierDisbursementCheckout({
                        order,
                        supplier: order.supplier,
                        amount: payoutAmount,
                        paymentMethod: checkoutPaymentMethod,
                        payer: req.user,
                    });

                    order.accountingProvider = 'Xendit Checkout';
                    order.accountingExternalId = checkout.id;
                    order.accountingReferenceId = checkout.referenceId;
                    order.accountingExternalStatus = checkout.status;
                    order.accountingFailureReason = '';
                    order.accountingChannelCode = checkout.paymentMethodCode;
                    order.accountingChannelName = checkout.paymentMethodCode;
                    order.accountingPaymentMethodType = paymentMethod.methodType || 'xendit_checkout';
                    order.accountingPaymentMethodProvider = paymentMethod.providerCode || checkout.paymentMethodCode;
                    order.accountingPaymentMethodName = paymentMethod.methodName || checkout.paymentMethodCode;
                    order.accountingPaymentMethodAccountName = paymentMethod.accountName || '';
                    order.accountingPaymentMethodAccountNumberMasked = maskAccountNumber(paymentMethod.accountNumber);
                    order.accountingSettlementStatus = 'InProgress';
                    order.accountingSettledAt = null;
                    order.accountingSettledBy = null;
                    order.accountingSettledByName = '';

                    appendDisbursementHistory(order, {
                        action,
                        status: checkout.status,
                        provider: 'Xendit Checkout',
                        payoutId: checkout.id,
                        referenceId: checkout.referenceId,
                        channelCode: checkout.paymentMethodCode,
                        channelName: checkout.paymentMethodCode,
                        amount: payoutAmount,
                        paymentMethodName: paymentMethod.methodName || checkout.paymentMethodCode,
                        paymentMethodAccountName: paymentMethod.accountName || '',
                        paymentMethodAccountNumberMasked: maskAccountNumber(paymentMethod.accountNumber),
                        failureReason: '',
                        processedBy: req.user._id,
                        processedByName: req.user.name || '',
                    });

                    await order.save();

                    const updatedOrder = await Order.findById(order._id)
                        .populate('product')
                        .populate('supplier')
                        .populate('createdBy', 'name role')
                        .populate('accountingSettledBy', 'name role');
                    const ordersWithPurchaseOrders = await attachPurchaseOrdersToOrders([updatedOrder]);
                    const ordersWithTransferOrders = await attachTransferOrdersToOrders(ordersWithPurchaseOrders);
                    return res.status(200).json({
                        ...ordersWithTransferOrders[0],
                        checkoutUrl: checkout.checkoutUrl,
                    });
                } else if (isEscrowSimulationEnabled()) {
                    if (action === 'RELEASE_ESCROW') {
                        if (order.accountingProvider !== 'Escrow Simulation' || order.accountingSettlementStatus !== 'InProgress') {
                            return res.status(400).json({ message: 'Only escrow-funded payables can be released.' });
                        }

                        order.accountingSettlementStatus = 'Settled';
                        order.accountingExternalStatus = 'RELEASED';
                        order.accountingFailureReason = '';
                        order.accountingSettledAt = new Date();
                        order.accountingSettledBy = req.user._id;
                        order.accountingSettledByName = req.user.name || '';

                        appendDisbursementHistory(order, {
                            action,
                            status: 'RELEASED',
                            provider: 'Escrow Simulation',
                            payoutId: order.accountingExternalId,
                            referenceId: order.accountingReferenceId,
                            channelCode: order.accountingChannelCode,
                            channelName: order.accountingChannelName,
                            amount: payoutAmount,
                            paymentMethodName: order.accountingPaymentMethodName,
                            paymentMethodAccountName: order.accountingPaymentMethodAccountName,
                            paymentMethodAccountNumberMasked: order.accountingPaymentMethodAccountNumberMasked,
                            failureReason: '',
                            processedBy: req.user._id,
                            processedByName: req.user.name || '',
                        });
                    } else {
                        const referenceId = buildEscrowSimulationReference(order._id);
                        order.accountingProvider = 'Escrow Simulation';
                        order.accountingExternalId = referenceId;
                        order.accountingReferenceId = referenceId;
                        order.accountingExternalStatus = 'HELD';
                        order.accountingFailureReason = '';
                        order.accountingChannelCode = paymentMethod.providerCode || '';
                        order.accountingChannelName = paymentMethod.methodName || paymentMethod.providerCode || 'Escrow';
                        order.accountingPaymentMethodType = paymentMethod.methodType || '';
                        order.accountingPaymentMethodProvider = paymentMethod.providerCode || '';
                        order.accountingPaymentMethodName = paymentMethod.methodName || paymentMethod.providerCode || '';
                        order.accountingPaymentMethodAccountName = paymentMethod.accountName || '';
                        order.accountingPaymentMethodAccountNumberMasked = maskAccountNumber(paymentMethod.accountNumber);
                        order.accountingSettlementStatus = 'InProgress';
                        order.accountingSettledAt = null;
                        order.accountingSettledBy = null;
                        order.accountingSettledByName = '';

                        appendDisbursementHistory(order, {
                            action,
                            status: 'HELD',
                            provider: 'Escrow Simulation',
                            payoutId: referenceId,
                            referenceId,
                            channelCode: order.accountingChannelCode,
                            channelName: order.accountingChannelName,
                            amount: payoutAmount,
                            paymentMethodName: order.accountingPaymentMethodName,
                            paymentMethodAccountName: order.accountingPaymentMethodAccountName,
                            paymentMethodAccountNumberMasked: order.accountingPaymentMethodAccountNumberMasked,
                            failureReason: '',
                            processedBy: req.user._id,
                            processedByName: req.user.name || '',
                        });
                    }
                } else {
                    if (action === 'RELEASE_ESCROW') {
                        return res.status(400).json({ message: 'Escrow release is only available in simulation mode.' });
                    }

                    const disbursement = await createSupplierDisbursement({
                        order,
                        supplier: order.supplier,
                        paymentMethod,
                        amount: payoutAmount,
                    });

                    const settlementStatus = resolveAccountingSettlementStatusFromPayout(disbursement.status);
                    const failureReason = buildAccountingFailureReason(disbursement);

                    order.accountingProvider = 'Xendit';
                    order.accountingExternalId = disbursement.id;
                    order.accountingReferenceId = disbursement.referenceId;
                    order.accountingExternalStatus = disbursement.status;
                    order.accountingFailureReason = failureReason;
                    order.accountingChannelCode = disbursement.channelCode;
                    order.accountingChannelName = disbursement.channelName;
                    order.accountingPaymentMethodType = paymentMethod.methodType || '';
                    order.accountingPaymentMethodProvider = paymentMethod.providerCode || '';
                    order.accountingPaymentMethodName = paymentMethod.methodName || disbursement.channelName || '';
                    order.accountingPaymentMethodAccountName = paymentMethod.accountName || '';
                    order.accountingPaymentMethodAccountNumberMasked = maskAccountNumber(paymentMethod.accountNumber);
                    order.accountingSettlementStatus = settlementStatus;
                    if (settlementStatus === 'Settled') {
                        order.accountingSettledAt = new Date();
                        order.accountingSettledBy = req.user._id;
                        order.accountingSettledByName = req.user.name || '';
                    } else {
                        order.accountingSettledAt = null;
                        order.accountingSettledBy = null;
                        order.accountingSettledByName = '';
                    }

                    appendDisbursementHistory(order, {
                        action,
                        status: disbursement.status,
                        provider: 'Xendit',
                        payoutId: disbursement.id,
                        referenceId: disbursement.referenceId,
                        channelCode: disbursement.channelCode,
                        channelName: disbursement.channelName,
                        amount: payoutAmount,
                        paymentMethodName: paymentMethod.methodName || disbursement.channelName || '',
                        paymentMethodAccountName: paymentMethod.accountName || '',
                        paymentMethodAccountNumberMasked: maskAccountNumber(paymentMethod.accountNumber),
                        failureReason,
                        processedBy: req.user._id,
                        processedByName: req.user.name || '',
                    });
                }
            }
        } else if (order.orderType === 'Outbound') {
            if (!['Pending', 'Shipped', 'Delivered'].includes(order.status)) {
                return res.status(400).json({ message: 'Only active customer sales can be recorded as accounts receivable.' });
            }

            if (action !== 'COLLECT') {
                return res.status(400).json({ message: 'Invalid accounting action for a customer receivable.' });
            }

            if (req.body.confirmed !== true) {
                return res.status(400).json({ message: 'Collection must be explicitly confirmed by the accountant or Super Admin.' });
            }
        } else {
            return res.status(400).json({ message: 'Stock transfers do not create accounting ledger actions in this workflow.' });
        }

        if (order.orderType !== 'Inbound') {
            order.accountingSettlementStatus = 'Settled';
            order.accountingSettledAt = new Date();
            order.accountingSettledBy = req.user._id;
            order.accountingSettledByName = req.user.name || '';
        }
        await order.save();

        const updatedOrder = await Order.findById(order._id)
            .populate('product')
            .populate('supplier')
            .populate('createdBy', 'name role')
            .populate('accountingSettledBy', 'name role');
        const ordersWithPurchaseOrders = await attachPurchaseOrdersToOrders([updatedOrder]);
        const ordersWithTransferOrders = await attachTransferOrdersToOrders(ordersWithPurchaseOrders);
        res.status(200).json(ordersWithTransferOrders[0]);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const createOrder = async (req, res) => {
    try {
        if (!req.user || ['Staff', 'Supplier', 'Accountant'].includes(req.user.role)) {
            return res.status(403).json({ message: 'Access Denied: Only managers and the Super Admin can create orders.' });
        }

        const payload = normalizeOrderPayload(req.body);
        const quantity = Number(payload.quantity);

        if (!validateOrderQuantity(quantity)) {
            return res.status(400).json({ message: 'Quantity must be greater than 0.' });
        }

        const product = await Product.findById(payload.product);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        await syncProductWarehouses(product);

        if (!(await ensureManagerWarehouseAccess(req.user, payload.warehouse))) {
            return res.status(403).json({ message: 'Access Denied: You can only create orders for your assigned warehouse.' });
        }

        let supplierUnitPrice = 0;
        let customerUnitPrice = 0;

        if (payload.orderType === 'Inbound') {
            if (payload.warehouse !== WAREHOUSE_A_NAME) {
                return res.status(400).json({ message: 'Supplier restocks can only be delivered to Warehouse A.' });
            }

            if (!payload.supplier) {
                return res.status(400).json({ message: 'Supplier is required for supplier restocks.' });
            }

            const supplierExists = await Supplier.findById(payload.supplier);
            if (!supplierExists) {
                return res.status(404).json({ message: 'Supplier not found' });
            }

            const linkedSupplierIds = (product.suppliers || []).map((supplierId) => String(supplierId));
            if (linkedSupplierIds.length === 0) {
                return res.status(400).json({ message: 'No suppliers are linked to this product. Bind suppliers first in Supply Network.' });
            }

            if (!linkedSupplierIds.includes(String(payload.supplier))) {
                return res.status(400).json({ message: 'Selected supplier is not linked to this product.' });
            }

            supplierUnitPrice = getSupplierUnitPriceForProduct(product, payload.supplier);
        }

        if (payload.orderType === 'Outbound') {
            const warehouseEntry = getWarehouseEntry(product, payload.warehouse);
            if (!warehouseEntry) {
                return res.status(400).json({ message: `Warehouse ${payload.warehouse} was not found for this product.` });
            }

            if (warehouseEntry.stock < quantity) {
                return res.status(400).json({
                    message: `Cannot create order. ${payload.warehouse} only has ${warehouseEntry.stock} units available for ${product.name}.`
                });
            }

            customerUnitPrice = Number(product.price || 0);
        }

        if (payload.orderType === 'Transfer') {
            if (!payload.sourceWarehouse) {
                return res.status(400).json({ message: 'Source warehouse is required for stock transfers.' });
            }

            if (payload.warehouse === WAREHOUSE_A_NAME) {
                return res.status(400).json({ message: 'Warehouse A cannot be the target of a stock transfer request.' });
            }

            if (payload.sourceWarehouse === payload.warehouse) {
                return res.status(400).json({ message: 'Source and target warehouses must be different.' });
            }

            const sourceWarehouseEntry = getWarehouseEntry(product, payload.sourceWarehouse);
            const targetWarehouseEntry = getWarehouseEntry(product, payload.warehouse);

            if (!sourceWarehouseEntry) {
                return res.status(400).json({ message: `Source warehouse ${payload.sourceWarehouse} was not found for this product.` });
            }

            if (!targetWarehouseEntry) {
                return res.status(400).json({ message: `Target warehouse ${payload.warehouse} was not found for this product.` });
            }

            if (sourceWarehouseEntry.stock < quantity) {
                return res.status(400).json({
                    message: `Cannot create transfer. ${payload.sourceWarehouse} only has ${sourceWarehouseEntry.stock} units available for ${product.name}.`
                });
            }

            payload.supplier = null;
        }

        if (payload.orderType !== 'Inbound') {
            payload.supplier = null;
        }

        const order = await Order.create({
            ...payload,
            quantity,
            supplierUnitPrice,
            expenseAmount: payload.orderType === 'Inbound' ? supplierUnitPrice * quantity : 0,
            customerUnitPrice,
            receivableAmount: payload.orderType === 'Outbound' ? customerUnitPrice * quantity : 0,
            createdBy: req.user?._id,
            createdByName: req.user?.name || 'Unknown User',
            createdByRole: req.user?.role || 'Unknown',
        });

        if (order.orderType === 'Inbound') {
            await createPurchaseOrderForInboundOrder(order);
        } else if (order.orderType === 'Transfer') {
            await createTransferOrderForOrder(order);
        }

        res.status(201).json(order);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getOrders = async (req, res) => {
    try {
        let query = {};

        if (req.user?.role === 'Supplier' && req.user?.supplier) {
            query = { supplier: req.user.supplier };
        } else {
            const warehouseFilter = await getManagerWarehouseNames(req.user);
            query = warehouseFilter
                ? { $or: [{ warehouse: { $in: warehouseFilter } }, { sourceWarehouse: { $in: warehouseFilter } }] }
                : {};
        }

        const orders = await Order.find(query)
            .populate('product')
            .populate('supplier')
            .populate('createdBy', 'name role')
            .sort({ createdAt: -1 });
        const ordersWithPurchaseOrders = await attachPurchaseOrdersToOrders(orders);
        const ordersWithTransferOrders = await attachTransferOrdersToOrders(ordersWithPurchaseOrders);
        res.status(200).json(ordersWithTransferOrders);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { createOrder, updateOrderStatus, updateOrderAccounting, getOrders };
