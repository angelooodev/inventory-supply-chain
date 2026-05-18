const Order = require('../models/orderModel');
const PurchaseOrder = require('../models/purchaseOrderModel');
const Warehouse = require('../models/warehouseModel');
const {
    getPublicPath,
    renderPurchaseOrderDocument,
    sendPurchaseOrderToSupplier,
    writeBase64Signature,
} = require('../utils/purchaseOrderService');

const WAREHOUSE_A_NAME = 'Warehouse A';

const getManagerWarehouseNames = async (user) => {
    if (!user || user.role !== 'Manager') {
        return null;
    }

    const assignedWarehouses = await Warehouse.find({ manager: user._id }).select('name').lean();
    return assignedWarehouses.map((warehouse) => warehouse.name);
};

const canAccessInboundPurchaseOrder = async (user, order) => {
    if (!user || user.role === 'Staff') {
        return false;
    }

    if (user.role === 'SuperAdmin') {
        return true;
    }

    const warehouseNames = await getManagerWarehouseNames(user);
    return warehouseNames?.includes(order.warehouse) || false;
};

const getPurchaseOrderByOrderId = async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId).populate('product').populate('supplier').lean();
        if (!order || order.orderType !== 'Inbound') {
            return res.status(404).json({ message: 'Purchase order not found.' });
        }

        if (!(await canAccessInboundPurchaseOrder(req.user, order))) {
            return res.status(403).json({ message: 'Access denied for this purchase order.' });
        }

        const purchaseOrder = await PurchaseOrder.findOne({ order: order._id }).lean();
        if (!purchaseOrder) {
            return res.status(404).json({ message: 'Purchase order not found.' });
        }

        res.status(200).json({
            ...purchaseOrder,
            order,
            companyDocumentUrl: getPublicPath(purchaseOrder.companyDocumentPath),
            finalDocumentUrl: getPublicPath(purchaseOrder.finalDocumentPath),
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const signPurchaseOrder = async (req, res) => {
    try {
        const { signatureDataUrl } = req.body;
        if (!signatureDataUrl) {
            return res.status(400).json({ message: 'Signature is required.' });
        }

        const order = await Order.findById(req.params.orderId).populate('product').populate('supplier');
        if (!order || order.orderType !== 'Inbound') {
            return res.status(404).json({ message: 'Purchase order not found.' });
        }

        const purchaseOrder = await PurchaseOrder.findOne({ order: order._id });
        if (!purchaseOrder) {
            return res.status(404).json({ message: 'Purchase order not found.' });
        }

        if (req.user.role === 'Manager') {
            const warehouseNames = await getManagerWarehouseNames(req.user);
            if (!warehouseNames?.includes(WAREHOUSE_A_NAME) || order.warehouse !== WAREHOUSE_A_NAME) {
                return res.status(403).json({ message: 'Only the Warehouse A manager can sign as preparer.' });
            }

            if (purchaseOrder.warehouseManagerSignature?.signedAt) {
                return res.status(400).json({ message: 'Warehouse A manager signature is already complete.' });
            }

            const signature = await writeBase64Signature(signatureDataUrl, `${purchaseOrder.poNumber}-warehouse-manager`);
            purchaseOrder.warehouseManagerSignature = {
                signerName: req.user.name,
                imagePath: signature.filePath,
                storageUrl: signature.storageUrl,
                signedAt: new Date(),
            };
            purchaseOrder.status = 'Awaiting CEO Signature';
        } else if (req.user.role === 'SuperAdmin') {
            if (!purchaseOrder.warehouseManagerSignature?.signedAt) {
                return res.status(400).json({ message: 'Warehouse A manager signature is required first.' });
            }

            if (purchaseOrder.ownerSignature?.signedAt && purchaseOrder.status === 'Awaiting Supplier Signature') {
                return res.status(400).json({ message: 'CEO signature is already complete.' });
            }

            const signature = await writeBase64Signature(signatureDataUrl, `${purchaseOrder.poNumber}-owner`);
            purchaseOrder.ownerSignature = {
                signerName: req.user.name,
                imagePath: signature.filePath,
                storageUrl: signature.storageUrl,
                signedAt: new Date(),
            };
        } else {
            return res.status(403).json({ message: 'Only the Warehouse A manager and SuperAdmin can sign this purchase order.' });
        }

        const outputType = purchaseOrder.ownerSignature?.signedAt ? 'company-signed' : 'company-draft';
        purchaseOrder.companyDocumentPath = await renderPurchaseOrderDocument(purchaseOrder, outputType);
        await purchaseOrder.save();

        let signingLink = '';
        if (purchaseOrder.warehouseManagerSignature?.signedAt && purchaseOrder.ownerSignature?.signedAt) {
            signingLink = await sendPurchaseOrderToSupplier(purchaseOrder);
        }

        res.status(200).json({
            ...purchaseOrder.toObject(),
            companyDocumentUrl: getPublicPath(purchaseOrder.companyDocumentPath),
            finalDocumentUrl: getPublicPath(purchaseOrder.finalDocumentPath),
            signingLink,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getSupplierPurchaseOrder = async (req, res) => {
    try {
        const purchaseOrder = await PurchaseOrder.findOne({
            supplierSigningToken: req.params.token,
            supplierTokenExpiresAt: { $gt: new Date() },
        }).populate({
            path: 'order',
            populate: [{ path: 'product' }, { path: 'supplier' }],
        });

        if (!purchaseOrder) {
            return res.status(404).json({ message: 'Supplier signing link is invalid or expired.' });
        }

        res.status(200).json({
            poNumber: purchaseOrder.poNumber,
            status: purchaseOrder.status,
            expectedDeliveryDate: purchaseOrder.expectedDeliveryDate,
            companyDocumentUrl: getPublicPath(purchaseOrder.companyDocumentPath),
            finalDocumentUrl: getPublicPath(purchaseOrder.finalDocumentPath),
            order: purchaseOrder.order,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const signSupplierPurchaseOrder = async (req, res) => {
    try {
        const { signatureDataUrl } = req.body;
        if (!signatureDataUrl) {
            return res.status(400).json({ message: 'Signature is required.' });
        }

        const purchaseOrder = await PurchaseOrder.findOne({
            supplierSigningToken: req.params.token,
            supplierTokenExpiresAt: { $gt: new Date() },
        });

        if (!purchaseOrder) {
            return res.status(404).json({ message: 'Supplier signing link is invalid or expired.' });
        }

        if (!purchaseOrder.ownerSignature?.signedAt || !purchaseOrder.warehouseManagerSignature?.signedAt) {
            return res.status(400).json({ message: 'Company signatures must be completed before supplier signing.' });
        }

        const order = await Order.findById(purchaseOrder.order).populate('supplier').lean();
        const supplierSignerName = order?.supplier?.contactPerson || order?.supplier?.name || 'Supplier Representative';

        purchaseOrder.supplierRepresentativeName = supplierSignerName;
        const signature = await writeBase64Signature(signatureDataUrl, `${purchaseOrder.poNumber}-supplier`);
        purchaseOrder.supplierSignature = {
            signerName: supplierSignerName,
            imagePath: signature.filePath,
            storageUrl: signature.storageUrl,
            signedAt: new Date(),
        };
        purchaseOrder.status = 'Supplier Signed';
        purchaseOrder.finalDocumentPath = await renderPurchaseOrderDocument(purchaseOrder, 'supplier-signed');
        purchaseOrder.supplierSigningToken = '';
        purchaseOrder.supplierTokenExpiresAt = null;
        await purchaseOrder.save();

        res.status(200).json({
            message: 'Purchase order signed successfully.',
            poNumber: purchaseOrder.poNumber,
            finalDocumentUrl: getPublicPath(purchaseOrder.finalDocumentPath),
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getPurchaseOrderByOrderId,
    getSupplierPurchaseOrder,
    signPurchaseOrder,
    signSupplierPurchaseOrder,
};
