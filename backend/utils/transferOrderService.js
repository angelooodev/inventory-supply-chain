const fs = require('fs/promises');
const path = require('path');
const AdmZip = require('adm-zip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');

const Order = require('../models/orderModel');
const Product = require('../models/productModel');
const TransferOrder = require('../models/transferOrderModel');
const Warehouse = require('../models/warehouseModel');
const { getPublicPath, writeBase64Signature } = require('./purchaseOrderService');

const BACKEND_ROOT = path.resolve(__dirname, '..');
const TEMPLATE_PATH = path.join(BACKEND_ROOT, 'templates', 'Warehouse_Stock_Transfer_Template.docx');
const STORAGE_ROOT = path.join(BACKEND_ROOT, 'storage');
const DOCUMENT_ROOT = path.join(STORAGE_ROOT, 'transfer-orders');
const WORD_NAMESPACE = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const REL_NAMESPACE = 'http://schemas.openxmlformats.org/package/2006/relationships';
const IMAGE_REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';

const formatDate = (value) => {
    const date = value ? new Date(value) : new Date();
    return date.toLocaleDateString('en-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
};

const slugify = (value) =>
    String(value || 'signature')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'signature';

const ensureDir = async (dirPath) => {
    await fs.mkdir(dirPath, { recursive: true });
};

const getElementChildren = (node, localName) =>
    Array.from(node.childNodes || []).filter(
        (child) => child.nodeType === 1 && (!localName || child.localName === localName)
    );

const getTableRows = (tableNode) => getElementChildren(tableNode, 'tr');
const getTableCells = (rowNode) => getElementChildren(rowNode, 'tc');

const removeNode = (node) => {
    if (node?.parentNode) {
        node.parentNode.removeChild(node);
    }
};

const createStyledParagraph = (documentDom, text, options = {}) => {
    const {
        alignment = null,
        underline = false,
        bold = false,
        before = null,
        after = null,
    } = options;

    const p = documentDom.createElementNS(WORD_NAMESPACE, 'w:p');
    if (alignment || before !== null || after !== null) {
        const pPr = documentDom.createElementNS(WORD_NAMESPACE, 'w:pPr');
        if (alignment) {
            const jc = documentDom.createElementNS(WORD_NAMESPACE, 'w:jc');
            jc.setAttribute('w:val', alignment);
            pPr.appendChild(jc);
        }
        if (before !== null || after !== null) {
            const spacing = documentDom.createElementNS(WORD_NAMESPACE, 'w:spacing');
            if (before !== null) spacing.setAttribute('w:before', String(before));
            if (after !== null) spacing.setAttribute('w:after', String(after));
            pPr.appendChild(spacing);
        }
        p.appendChild(pPr);
    }

    const r = documentDom.createElementNS(WORD_NAMESPACE, 'w:r');
    if (underline || bold) {
        const rPr = documentDom.createElementNS(WORD_NAMESPACE, 'w:rPr');
        if (underline) {
            const underlineNode = documentDom.createElementNS(WORD_NAMESPACE, 'w:u');
            underlineNode.setAttribute('w:val', 'single');
            rPr.appendChild(underlineNode);
        }
        if (bold) {
            rPr.appendChild(documentDom.createElementNS(WORD_NAMESPACE, 'w:b'));
        }
        r.appendChild(rPr);
    }
    const t = documentDom.createElementNS(WORD_NAMESPACE, 'w:t');
    if (/^\s|\s$/.test(text)) {
        t.setAttribute('xml:space', 'preserve');
    }
    t.appendChild(documentDom.createTextNode(String(text || '')));
    r.appendChild(t);
    p.appendChild(r);
    return p;
};

const createPageBreakParagraph = (documentDom) => {
    const p = documentDom.createElementNS(WORD_NAMESPACE, 'w:p');
    const r = documentDom.createElementNS(WORD_NAMESPACE, 'w:r');
    const br = documentDom.createElementNS(WORD_NAMESPACE, 'w:br');
    br.setAttribute('w:type', 'page');
    r.appendChild(br);
    p.appendChild(r);
    return p;
};

const setCellParagraphText = (cellNode, text, alignment = null) => {
    const documentDom = cellNode.ownerDocument;
    const preserved = Array.from(cellNode.childNodes || []).filter(
        (child) => child.nodeType === 1 && child.localName === 'tcPr'
    );
    while (cellNode.firstChild) {
        cellNode.removeChild(cellNode.firstChild);
    }
    preserved.forEach((node) => cellNode.appendChild(node));
    cellNode.appendChild(createStyledParagraph(documentDom, text, { alignment }));
};

const parsePngDimensions = (buffer) => {
    if (buffer.toString('ascii', 1, 4) !== 'PNG') {
        return { width: 320, height: 120 };
    }

    return {
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20),
    };
};

const ensurePngContentType = (contentTypesDom) => {
    const typesNode = contentTypesDom.documentElement;
    const defaults = Array.from(typesNode.childNodes || []).filter(
        (child) => child.nodeType === 1 && child.localName === 'Default'
    );
    const hasPng = defaults.some((node) => node.getAttribute('Extension') === 'png');
    if (hasPng) {
        return;
    }

    const pngDefault = contentTypesDom.createElement('Default');
    pngDefault.setAttribute('Extension', 'png');
    pngDefault.setAttribute('ContentType', 'image/png');
    typesNode.appendChild(pngDefault);
};

const getNextRelationshipId = (relsDom) => {
    const rels = Array.from(relsDom.documentElement.childNodes || []).filter((child) => child.nodeType === 1);
    const maxId = rels.reduce((max, node) => {
        const match = /^rId(\d+)$/.exec(node.getAttribute('Id') || '');
        return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    return `rId${maxId + 1}`;
};

const addImageRelationship = (zip, relsDom, imagePath, imageLabel) => {
    if (!imagePath) return null;

    const extension = path.extname(imagePath) || '.png';
    const mediaName = `${slugify(imageLabel)}-${Date.now()}${extension}`;
    const imageEntryPath = `word/media/${mediaName}`;

    const relId = getNextRelationshipId(relsDom);
    const relNode = relsDom.createElementNS(REL_NAMESPACE, 'Relationship');
    relNode.setAttribute('Id', relId);
    relNode.setAttribute('Type', IMAGE_REL_TYPE);
    relNode.setAttribute('Target', `media/${mediaName}`);
    relsDom.documentElement.appendChild(relNode);

    return { relId, imageEntryPath, imageBufferPromise: fs.readFile(imagePath) };
};

const createImageRunXml = ({ relId, widthPx, heightPx, docPrId, horizontalAlign = 'center' }) => {
    const emuPerPixel = 9525;
    const cx = Math.round(widthPx * emuPerPixel);
    const cy = Math.round(heightPx * emuPerPixel);

    return `
        <w:r xmlns:w="${WORD_NAMESPACE}">
            <w:drawing>
                <wp:anchor xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" simplePos="0" relativeHeight="251658240" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1" distT="0" distB="0" distL="0" distR="0">
                    <wp:simplePos x="0" y="0"/>
                    <wp:positionH relativeFrom="column"><wp:align>${horizontalAlign}</wp:align></wp:positionH>
                    <wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV>
                    <wp:extent cx="${cx}" cy="${cy}"/>
                    <wp:effectExtent l="0" t="0" r="0" b="0"/>
                    <wp:wrapNone/>
                    <wp:docPr id="${docPrId}" name="Signature"/>
                    <wp:cNvGraphicFramePr>
                        <a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/>
                    </wp:cNvGraphicFramePr>
                    <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
                        <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                            <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                                <pic:nvPicPr>
                                    <pic:cNvPr id="0" name="Signature"/>
                                    <pic:cNvPicPr/>
                                </pic:nvPicPr>
                                <pic:blipFill>
                                    <a:blip r:embed="${relId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
                                    <a:stretch><a:fillRect/></a:stretch>
                                </pic:blipFill>
                                <pic:spPr>
                                    <a:xfrm>
                                        <a:off x="0" y="0"/>
                                        <a:ext cx="${cx}" cy="${cy}"/>
                                    </a:xfrm>
                                    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                                </pic:spPr>
                            </pic:pic>
                        </a:graphicData>
                    </a:graphic>
                </wp:anchor>
            </w:drawing>
        </w:r>
    `;
};

const setParagraphRunsFromXml = (paragraphNode, runXmlList) => {
    while (paragraphNode.firstChild) {
        paragraphNode.removeChild(paragraphNode.firstChild);
    }

    const parser = new DOMParser();
    runXmlList.forEach((runXml) => {
        const runDoc = parser.parseFromString(`<root xmlns:w="${WORD_NAMESPACE}">${runXml}</root>`, 'text/xml');
        Array.from(runDoc.documentElement.childNodes || [])
            .filter((child) => child.nodeType === 1)
            .forEach((child) => {
                paragraphNode.appendChild(paragraphNode.ownerDocument.importNode(child, true));
            });
    });
};

const generateNextTransferNumber = async () => {
    const prefix = `TR-${new Date().getFullYear()}`;
    const existingCount = await TransferOrder.countDocuments({
        transferNumber: { $regex: `^${prefix}-` },
    });

    return `${prefix}-${String(existingCount + 1).padStart(4, '0')}`;
};

const createTransferOrderForOrder = async (order) => {
    if (!order || order.orderType !== 'Transfer') {
        return null;
    }

    const existing = await TransferOrder.findOne({ order: order._id });
    if (existing) {
        return existing;
    }

    const transferOrder = await TransferOrder.create({
        order: order._id,
        transferNumber: await generateNextTransferNumber(),
        requiredTransferDate: new Date(order.createdAt || Date.now()),
    });

    return transferOrder;
};

const buildDocumentPayload = async (transferOrder) => {
    const order = await Order.findById(transferOrder.order).populate('product').lean();
    if (!order) {
        throw new Error('Order not found for stock transfer document generation.');
    }

    const [requestingWarehouse, requestedWarehouse] = await Promise.all([
        Warehouse.findOne({ name: order.warehouse }).populate('manager', 'name email').lean(),
        Warehouse.findOne({ name: order.sourceWarehouse }).populate('manager', 'name email').lean(),
    ]);

    const product = order.product;
    const quantity = Number(order.quantity || 0);

    return {
        transfer_number: transferOrder.transferNumber,
        date_requested: formatDate(order.createdAt),
        required_transfer_date: formatDate(transferOrder.requiredTransferDate || order.createdAt),
        transfer_status: transferOrder.status,
        requesting_warehouse_name: requestingWarehouse?.name || order.warehouse || '',
        requesting_warehouse_address: requestingWarehouse?.address || '',
        requesting_warehouse_manager: transferOrder.requestingWarehouseSignature?.signerName || requestingWarehouse?.manager?.name || 'Requesting Warehouse Manager',
        requesting_warehouse_contact: requestingWarehouse?.manager?.email || 'N/A',
        requested_warehouse_name: requestedWarehouse?.name || order.sourceWarehouse || '',
        requested_warehouse_address: requestedWarehouse?.address || '',
        requested_warehouse_manager: transferOrder.requestedWarehouseSignature?.signerName || requestedWarehouse?.manager?.name || 'Requested Warehouse Manager',
        requested_warehouse_contact: requestedWarehouse?.manager?.email || 'N/A',
        item_sku: product?.sku || '',
        item_description: product?.name || '',
        quantity: String(quantity),
        unit: product?.unitOfMeasure || 'unit',
        remarks: `Transfer to ${order.warehouse || ''}`.trim(),
        total_items: '1',
        total_quantity: String(quantity),
        requesting_manager_signature_path: transferOrder.requestingWarehouseSignature?.imagePath || '',
        requested_manager_signature_path: transferOrder.requestedWarehouseSignature?.imagePath || '',
        requesting_signature_date: transferOrder.requestingWarehouseSignature?.signedAt ? formatDate(transferOrder.requestingWarehouseSignature.signedAt) : '',
        requested_signature_date: transferOrder.requestedWarehouseSignature?.signedAt ? formatDate(transferOrder.requestedWarehouseSignature.signedAt) : '',
    };
};

const getParagraphText = (paragraphNode) => Array.from(paragraphNode.getElementsByTagName('w:t') || [])
    .map((node) => node.textContent || '')
    .join('');

const clearTransferOrderSignatureStorage = async (transferOrder) => {
    if (!transferOrder) return;
    if (transferOrder.requestingWarehouseSignature) {
        transferOrder.requestingWarehouseSignature.storageUrl = '';
    }
    if (transferOrder.requestedWarehouseSignature) {
        transferOrder.requestedWarehouseSignature.storageUrl = '';
    }
};

const renderTransferOrderDocument = async (transferOrder, outputType = 'draft') => {
    await ensureDir(DOCUMENT_ROOT);

    const payload = await buildDocumentPayload(transferOrder);
    const outputPath = path.join(DOCUMENT_ROOT, `${transferOrder.transferNumber}-${outputType}.docx`);

    const zip = new AdmZip(TEMPLATE_PATH);
    const parser = new DOMParser();
    const serializer = new XMLSerializer();

    const documentDom = parser.parseFromString(zip.readAsText('word/document.xml'), 'text/xml');
    const relsDom = parser.parseFromString(zip.readAsText('word/_rels/document.xml.rels'), 'text/xml');
    const contentTypesDom = parser.parseFromString(zip.readAsText('[Content_Types].xml'), 'text/xml');

    ensurePngContentType(contentTypesDom);

    const body = getElementChildren(documentDom.documentElement, 'body')[0];
    const tables = getElementChildren(body, 'tbl');
    const paragraphs = getElementChildren(body, 'p');

    const detailsTable = tables[0];
    const requestingWarehouseTable = tables[1];
    const requestedWarehouseTable = tables[2];
    const itemsTable = tables[3];
    const summaryTable = tables[4];
    const signatoryTable = tables[5];

    const detailCells = getTableCells(getTableRows(detailsTable)[1]);
    setCellParagraphText(detailCells[0], payload.transfer_number, 'center');
    setCellParagraphText(detailCells[1], payload.date_requested, 'center');
    setCellParagraphText(detailCells[2], payload.required_transfer_date, 'center');
    setCellParagraphText(detailCells[3], payload.transfer_status, 'center');

    const requestingRows = getTableRows(requestingWarehouseTable);
    [
        payload.requesting_warehouse_name,
        payload.requesting_warehouse_address,
        payload.requesting_warehouse_manager,
        payload.requesting_warehouse_contact,
    ].forEach((value, index) => setCellParagraphText(getTableCells(requestingRows[index])[1], value));

    const requestedRows = getTableRows(requestedWarehouseTable);
    [
        payload.requested_warehouse_name,
        payload.requested_warehouse_address,
        payload.requested_warehouse_manager,
        payload.requested_warehouse_contact,
    ].forEach((value, index) => setCellParagraphText(getTableCells(requestedRows[index])[1], value));

    const itemRows = getTableRows(itemsTable);
    const firstItemCells = getTableCells(itemRows[1]);
    setCellParagraphText(firstItemCells[1], payload.item_sku);
    setCellParagraphText(firstItemCells[2], payload.item_description);
    setCellParagraphText(firstItemCells[3], payload.quantity, 'center');
    setCellParagraphText(firstItemCells[4], payload.unit, 'center');
    setCellParagraphText(firstItemCells[5], payload.remarks);
    for (let index = 2; index < itemRows.length; index += 1) {
        removeNode(itemRows[index]);
    }

    const summaryRows = getTableRows(summaryTable);
    removeNode(summaryRows[2]);
    const trimmedSummaryRows = getTableRows(summaryTable);
    setCellParagraphText(getTableCells(trimmedSummaryRows[0])[1], payload.total_items);
    setCellParagraphText(getTableCells(trimmedSummaryRows[1])[1], payload.total_quantity);

    const transferMethodParagraph = paragraphs.find((paragraph) => getParagraphText(paragraph).includes('Transfer Method:'));
    const handledByParagraph = paragraphs.find((paragraph) => getParagraphText(paragraph).includes('Handled By / Driver:'));
    removeNode(transferMethodParagraph);
    removeNode(handledByParagraph);

    const pickupParagraph = paragraphs.find((paragraph) => getParagraphText(paragraph).includes('Pickup Location:'));
    const deliveryParagraph = paragraphs.find((paragraph) => getParagraphText(paragraph).includes('Delivery Location:'));
    if (pickupParagraph) {
        while (pickupParagraph.firstChild) pickupParagraph.removeChild(pickupParagraph.firstChild);
        pickupParagraph.appendChild(createStyledParagraph(documentDom, `Pickup Location: ${payload.requested_warehouse_name} - ${payload.requested_warehouse_address}`).firstChild);
    }
    if (deliveryParagraph) {
        while (deliveryParagraph.firstChild) deliveryParagraph.removeChild(deliveryParagraph.firstChild);
        deliveryParagraph.appendChild(createStyledParagraph(documentDom, `Delivery Location: ${payload.requesting_warehouse_name} - ${payload.requesting_warehouse_address}`).firstChild);
    }

    if (signatoryTable?.parentNode) {
        signatoryTable.parentNode.insertBefore(createPageBreakParagraph(documentDom), signatoryTable);
    }

    const imageRefs = [];
    if (payload.requesting_manager_signature_path) {
        imageRefs.push({ key: 'requesting', ref: addImageRelationship(zip, relsDom, payload.requesting_manager_signature_path, `${transferOrder.transferNumber}-requesting`) });
    }
    if (payload.requested_manager_signature_path) {
        imageRefs.push({ key: 'requested', ref: addImageRelationship(zip, relsDom, payload.requested_manager_signature_path, `${transferOrder.transferNumber}-requested`) });
    }

    const resolvedImageRefs = {};
    for (const imageRef of imageRefs) {
        if (!imageRef.ref) continue;
        const imageBuffer = await imageRef.ref.imageBufferPromise;
        const dimensions = parsePngDimensions(imageBuffer);
        const maxWidth = 98;
        const scaledWidth = Math.min(dimensions.width, maxWidth);
        const scaledHeight = Math.max(34, Math.round((dimensions.height / dimensions.width) * scaledWidth));
        zip.addFile(imageRef.ref.imageEntryPath, imageBuffer);
        resolvedImageRefs[imageRef.key] = {
            relId: imageRef.ref.relId,
            widthPx: scaledWidth,
            heightPx: scaledHeight,
        };
    }

    const signRows = getTableRows(signatoryTable);
    const signCells = getTableCells(signRows[1]);

    const buildSignatoryCell = ({ signatureRef, signerName, signedDate, docPrId }) => {
        const cell = signCells[docPrId === 201 ? 0 : 1];
        const tcPr = getElementChildren(cell, 'tcPr')[0];
        while (cell.firstChild) {
            cell.removeChild(cell.firstChild);
        }
        cell.appendChild(tcPr);

        const imageParagraph = createStyledParagraph(documentDom, '', { alignment: 'center', after: 70 });
        if (signatureRef) {
            setParagraphRunsFromXml(imageParagraph, [createImageRunXml({ ...signatureRef, docPrId, horizontalAlign: 'center' })]);
        }

        cell.appendChild(createStyledParagraph(documentDom, '', { alignment: 'center', after: 10 }));
        cell.appendChild(imageParagraph);
        cell.appendChild(createStyledParagraph(documentDom, '_____________________________', { alignment: 'center', after: 20 }));
        cell.appendChild(createStyledParagraph(documentDom, signerName, { alignment: 'center', after: 20 }));
        cell.appendChild(createStyledParagraph(documentDom, `Date Signed: ${signedDate || ''}`, { alignment: 'center' }));
    };

    buildSignatoryCell({
        signatureRef: resolvedImageRefs.requesting,
        signerName: payload.requesting_warehouse_manager,
        signedDate: payload.requesting_signature_date,
        docPrId: 201,
    });
    buildSignatoryCell({
        signatureRef: resolvedImageRefs.requested,
        signerName: payload.requested_warehouse_manager,
        signedDate: payload.requested_signature_date,
        docPrId: 202,
    });

    zip.updateFile('word/document.xml', Buffer.from(serializer.serializeToString(documentDom), 'utf-8'));
    zip.updateFile('word/_rels/document.xml.rels', Buffer.from(serializer.serializeToString(relsDom), 'utf-8'));
    zip.updateFile('[Content_Types].xml', Buffer.from(serializer.serializeToString(contentTypesDom), 'utf-8'));
    zip.writeZip(outputPath);

    return outputPath;
};

const attachTransferOrdersToOrders = async (orders) => {
    const orderIds = orders.map((order) => order._id);
    const transferOrders = await TransferOrder.find({ order: { $in: orderIds } }).lean();
    const transferOrderMap = new Map(
        transferOrders.map((transferOrder) => [String(transferOrder.order), transferOrder])
    );

    return orders.map((order) => {
        const plainOrder = typeof order.toObject === 'function' ? order.toObject() : order;
        const transferOrder = transferOrderMap.get(String(plainOrder._id)) || null;

        return {
            ...plainOrder,
            transferOrder: transferOrder
                ? {
                    ...transferOrder,
                    documentUrl: getPublicPath(transferOrder.documentPath),
                    finalDocumentUrl: getPublicPath(transferOrder.finalDocumentPath),
                }
                : null,
        };
    });
};

module.exports = {
    attachTransferOrdersToOrders,
    clearTransferOrderSignatureStorage,
    createTransferOrderForOrder,
    renderTransferOrderDocument,
    writeBase64Signature,
};
