const Order = require('../models/orderModel');
const TransferOrder = require('../models/transferOrderModel');
const Warehouse = require('../models/warehouseModel');
const {
    renderTransferOrderDocument,
    writeBase64Signature,
    attachTransferOrdersToOrders,
} = require('../utils/transferOrderService');
const { getPublicPath } = require('../utils/purchaseOrderService');

const getManagerWarehouseNames = async (user) => {
    if (!user || user.role !== 'Manager') {
        return null;
    }

    const assignedWarehouses = await Warehouse.find({ manager: user._id }).select('name').lean();
    return assignedWarehouses.map((warehouse) => warehouse.name);
};

const canAccessTransferOrder = async (user, order) => {
    if (!user || user.role !== 'Manager') {
        return false;
    }

    const warehouseNames = await getManagerWarehouseNames(user);
    return warehouseNames?.includes(order.warehouse) || warehouseNames?.includes(order.sourceWarehouse) || false;
};

const getTransferOrderByOrderId = async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId).populate('product').lean();
        if (!order || order.orderType !== 'Transfer') {
            return res.status(404).json({ message: 'Stock transfer document not found.' });
        }

        if (!(await canAccessTransferOrder(req.user, order))) {
            return res.status(403).json({ message: 'Access denied for this stock transfer document.' });
        }

        const transferOrder = await TransferOrder.findOne({ order: order._id });
        if (!transferOrder) {
            return res.status(404).json({ message: 'Stock transfer document not found.' });
        }

        const hasAnyManagerSignature = Boolean(
            transferOrder.requestingWarehouseSignature?.signedAt || transferOrder.requestedWarehouseSignature?.signedAt
        );

        if (hasAnyManagerSignature) {
            transferOrder.documentPath = await renderTransferOrderDocument(transferOrder, 'draft');
        } else {
            transferOrder.documentPath = '';
        }

        if (transferOrder.status === 'Transfer Signed') {
            transferOrder.finalDocumentPath = await renderTransferOrderDocument(transferOrder, 'signed');
        } else {
            transferOrder.finalDocumentPath = '';
        }
        await transferOrder.save();

        const plainTransferOrder = transferOrder.toObject();

        res.status(200).json({
            ...plainTransferOrder,
            order,
            documentUrl: getPublicPath(plainTransferOrder.documentPath),
            finalDocumentUrl: getPublicPath(plainTransferOrder.finalDocumentPath),
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const signTransferOrder = async (req, res) => {
    try {
        const { signatureDataUrl } = req.body;
        if (!signatureDataUrl) {
            return res.status(400).json({ message: 'Signature is required.' });
        }

        if (!req.user || req.user.role !== 'Manager') {
            return res.status(403).json({ message: 'Only warehouse managers can sign this stock transfer document.' });
        }

        const order = await Order.findById(req.params.orderId).populate('product');
        if (!order || order.orderType !== 'Transfer') {
            return res.status(404).json({ message: 'Stock transfer document not found.' });
        }

        const transferOrder = await TransferOrder.findOne({ order: order._id });
        if (!transferOrder) {
            return res.status(404).json({ message: 'Stock transfer document not found.' });
        }

        const warehouseNames = await getManagerWarehouseNames(req.user);
        const isRequestingManager = warehouseNames?.includes(order.warehouse);
        const isRequestedManager = warehouseNames?.includes(order.sourceWarehouse);

        if (!isRequestingManager && !isRequestedManager) {
            return res.status(403).json({ message: 'Only the requesting and requested warehouse managers can sign this transfer.' });
        }

        if (transferOrder.status === 'Awaiting Requesting Warehouse Manager Signature') {
            if (!isRequestingManager) {
                return res.status(403).json({ message: 'The requesting warehouse manager must sign first.' });
            }

            if (transferOrder.requestingWarehouseSignature?.signedAt) {
                return res.status(400).json({ message: 'Requesting warehouse manager signature is already complete.' });
            }

            const signature = await writeBase64Signature(signatureDataUrl, `${transferOrder.transferNumber}-requesting-manager`);
            transferOrder.requestingWarehouseSignature = {
                signerName: req.user.name,
                imagePath: signature.filePath,
                storageUrl: signature.storageUrl,
                signedAt: new Date(),
            };
            transferOrder.status = 'Awaiting Requested Warehouse Manager Signature';
            transferOrder.documentPath = await renderTransferOrderDocument(transferOrder, 'draft');
        } else if (transferOrder.status === 'Awaiting Requested Warehouse Manager Signature') {
            if (!isRequestedManager) {
                return res.status(403).json({ message: 'The requested warehouse manager must complete the second signature.' });
            }

            if (!transferOrder.requestingWarehouseSignature?.signedAt) {
                return res.status(400).json({ message: 'The requesting warehouse manager must sign first.' });
            }

            if (transferOrder.requestedWarehouseSignature?.signedAt) {
                return res.status(400).json({ message: 'Requested warehouse manager signature is already complete.' });
            }

            const signature = await writeBase64Signature(signatureDataUrl, `${transferOrder.transferNumber}-requested-manager`);
            transferOrder.requestedWarehouseSignature = {
                signerName: req.user.name,
                imagePath: signature.filePath,
                storageUrl: signature.storageUrl,
                signedAt: new Date(),
            };
            transferOrder.status = 'Transfer Signed';
            transferOrder.finalDocumentPath = await renderTransferOrderDocument(transferOrder, 'signed');
        } else {
            return res.status(400).json({ message: 'This stock transfer document is already fully signed.' });
        }

        if (!transferOrder.documentPath) {
            transferOrder.documentPath = await renderTransferOrderDocument(transferOrder, 'draft');
        }

        await transferOrder.save();

        const [refreshed] = await attachTransferOrdersToOrders([order]);
        res.status(200).json(refreshed.transferOrder);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getTransferOrderByOrderId,
    signTransferOrder,
};
