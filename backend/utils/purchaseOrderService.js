const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const AdmZip = require('adm-zip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');

const Order = require('../models/orderModel');
const Product = require('../models/productModel');
const PurchaseOrder = require('../models/purchaseOrderModel');
const Supplier = require('../models/supplierModel');
const User = require('../models/userModel');
const Warehouse = require('../models/warehouseModel');

const WAREHOUSE_A_NAME = 'Warehouse A';
const BACKEND_ROOT = path.resolve(__dirname, '..');
const TEMPLATE_PATH = path.join(BACKEND_ROOT, 'templates', 'Purchase_Order_Template.docx');
const STORAGE_ROOT = path.join(BACKEND_ROOT, 'storage');
const DOCUMENT_ROOT = path.join(STORAGE_ROOT, 'purchase-orders');
const SIGNATURE_ROOT = path.join(STORAGE_ROOT, 'signatures');
const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
const WORD_NAMESPACE = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const REL_NAMESPACE = 'http://schemas.openxmlformats.org/package/2006/relationships';
const IMAGE_REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';

const COMPANY = {
    name: 'Lumiere Corporation',
    address: 'Natalio B. Bacalso Ave, Bulacao Pardo, Cebu City, 6000 Cebu',
    contactNumber: '09705157399',
    email: 'earljustinesierra@gmail.com',
    ownerName: 'Lumiere Corporation CEO',
};

const formatDate = (value) => {
    const date = value ? new Date(value) : new Date();
    return date.toLocaleDateString('en-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
};

const formatCurrency = (value) => `PHP ${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const slugify = (value) =>
    String(value || 'signature')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'signature';

const ensureDir = async (dirPath) => {
    await fs.mkdir(dirPath, { recursive: true });
};

const fileExists = async (filePath) => {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
};

const getPublicPath = (filePath) => {
    if (!filePath) return '';
    const relativePath = path.relative(STORAGE_ROOT, filePath).split(path.sep).join('/');
    return `/files/${relativePath}`;
};

const getFrontendBaseUrl = () => process.env.FRONTEND_BASE_URL || process.env.APP_BASE_URL || 'http://localhost:5173';
const getSupabaseBaseUrl = () => process.env.SUPABASE_URL || '';
const getSupabaseBucketName = () => process.env.SUPABASE_SIGNATURE_BUCKET || 'signatures';
const getSupabaseApiKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

const uploadSignatureToSupabase = async (buffer, fileName) => {
    const supabaseUrl = getSupabaseBaseUrl().replace(/\/$/, '');
    const apiKey = getSupabaseApiKey();
    if (!supabaseUrl || !apiKey) {
        return '';
    }

    const bucket = getSupabaseBucketName();
    const objectPath = `purchase-orders/${fileName}`;
    const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${objectPath}`;

    const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
            apikey: apiKey,
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'image/png',
            'x-upsert': 'true',
        },
        body: buffer,
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Supabase upload failed: ${errorText}`);
    }

    return `${supabaseUrl}/storage/v1/object/public/${bucket}/${objectPath}`;
};

const getSupabaseObjectPathFromUrl = (storageUrl) => {
    if (!storageUrl) return '';

    const supabaseUrl = getSupabaseBaseUrl().replace(/\/$/, '');
    const bucket = getSupabaseBucketName();
    const publicPrefix = `${supabaseUrl}/storage/v1/object/public/${bucket}/`;

    if (!storageUrl.startsWith(publicPrefix)) {
        return '';
    }

    return storageUrl.slice(publicPrefix.length);
};

const removeSupabaseSignatureObjects = async (storageUrls = []) => {
    const supabaseUrl = getSupabaseBaseUrl().replace(/\/$/, '');
    const apiKey = getSupabaseApiKey();
    if (!supabaseUrl || !apiKey) {
        return;
    }

    const prefixes = storageUrls
        .map(getSupabaseObjectPathFromUrl)
        .filter(Boolean);

    if (prefixes.length === 0) {
        return;
    }

    const bucket = getSupabaseBucketName();
    const removeUrl = `${supabaseUrl}/storage/v1/object/${bucket}`;
    const response = await fetch(removeUrl, {
        method: 'DELETE',
        headers: {
            apikey: apiKey,
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prefixes }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Supabase signature cleanup failed: ${errorText}`);
    }
};

const clearPurchaseOrderSignatureStorage = async (purchaseOrder) => {
    if (!purchaseOrder) return;

    await removeSupabaseSignatureObjects([
        purchaseOrder.warehouseManagerSignature?.storageUrl,
        purchaseOrder.ownerSignature?.storageUrl,
        purchaseOrder.supplierSignature?.storageUrl,
    ]);

    if (purchaseOrder.warehouseManagerSignature) {
        purchaseOrder.warehouseManagerSignature.storageUrl = '';
    }
    if (purchaseOrder.ownerSignature) {
        purchaseOrder.ownerSignature.storageUrl = '';
    }
    if (purchaseOrder.supplierSignature) {
        purchaseOrder.supplierSignature.storageUrl = '';
    }
};

const writeBase64Signature = async (signatureDataUrl, signerLabel) => {
    const matches = /^data:image\/png;base64,(.+)$/.exec(signatureDataUrl || '');
    if (!matches) {
        throw new Error('Signature must be a PNG data URL.');
    }

    await ensureDir(SIGNATURE_ROOT);

    const fileName = `${Date.now()}-${slugify(signerLabel)}.png`;
    const filePath = path.join(SIGNATURE_ROOT, fileName);
    const fileBuffer = Buffer.from(matches[1], 'base64');
    await fs.writeFile(filePath, fileBuffer);
    let storageUrl = '';

    try {
        storageUrl = await uploadSignatureToSupabase(fileBuffer, fileName);
    } catch (error) {
        console.warn(error.message);
    }

    return { filePath, storageUrl };
};

const generateNextPoNumber = async () => {
    const prefix = `PO-${new Date().getFullYear()}`;
    const existingCount = await PurchaseOrder.countDocuments({
        poNumber: { $regex: `^${prefix}-` },
    });

    return `${prefix}-${String(existingCount + 1).padStart(4, '0')}`;
};

const getExpectedDeliveryDate = (supplier) => {
    const leadTimeDays = Number(supplier?.leadTimeDays || 7);
    const expectedDate = new Date();
    expectedDate.setDate(expectedDate.getDate() + leadTimeDays);
    return expectedDate;
};

const createPurchaseOrderForInboundOrder = async (order) => {
    if (!order || order.orderType !== 'Inbound') {
        return null;
    }

    const existing = await PurchaseOrder.findOne({ order: order._id });
    if (existing) {
        return existing;
    }

    const supplier = await Supplier.findById(order.supplier).lean();
    if (!supplier) {
        throw new Error('Supplier not found for purchase order generation.');
    }

    const purchaseOrder = await PurchaseOrder.create({
        order: order._id,
        poNumber: await generateNextPoNumber(),
        expectedDeliveryDate: getExpectedDeliveryDate(supplier),
    });

    return purchaseOrder;
};

const buildDocumentPayload = async (purchaseOrder) => {
    const order = await Order.findById(purchaseOrder.order).populate('product').populate('supplier').lean();
    if (!order) {
        throw new Error('Order not found for purchase order document generation.');
    }

    const warehouse = await Warehouse.findOne({ name: order.warehouse }).lean();
    const ownerAccount = await User.findOne({ role: 'SuperAdmin' }).select('name').lean();
    const product = order.product;
    const supplier = order.supplier;

    const supplierId = String(supplier?._id || '');
    const supplierPriceEntry = Array.isArray(product?.supplierPricing)
        ? product.supplierPricing.find((entry) => String(entry?.supplier || '') === supplierId)
        : null;
    const unitPrice = Number(order.supplierUnitPrice ?? supplierPriceEntry?.cost ?? product?.price ?? 0);
    const subtotal = unitPrice * Number(order.quantity || 0);
    const vat = 0;
    const shippingFee = 0;
    const totalAmount = subtotal + vat + shippingFee;

    return {
        po_number: purchaseOrder.poNumber,
        date_issued: formatDate(order.createdAt),
        delivery_date: formatDate(purchaseOrder.expectedDeliveryDate || order.createdAt),
        supplier_name: supplier?.name || '',
        contact_person: supplier?.contactPerson || '',
        supplier_address: supplier?.address || '',
        supplier_contact: supplier?.phone || '',
        items: [
            {
                item_number: '1',
                description: product?.name || '',
                quantity: String(order.quantity || 0),
                unit_price: formatCurrency(unitPrice),
                amount: formatCurrency(subtotal),
            },
        ],
        subtotal: formatCurrency(subtotal),
        vat: formatCurrency(vat),
        shipping_fee: formatCurrency(shippingFee),
        total_amount: formatCurrency(totalAmount),
        warehouse_name: warehouse?.name || order.warehouse || WAREHOUSE_A_NAME,
        warehouse_address: warehouse?.address || '',
        warehouse_manager_signature_path: purchaseOrder.warehouseManagerSignature?.imagePath || '',
        owner_signature_path: purchaseOrder.ownerSignature?.imagePath || '',
        supplier_signature_path: purchaseOrder.supplierSignature?.imagePath || '',
        warehouse_manager_name: purchaseOrder.warehouseManagerSignature?.signerName || order.createdByName || 'Warehouse Manager',
        owner_name: purchaseOrder.ownerSignature?.signerName || ownerAccount?.name || COMPANY.ownerName,
        supplier_representative: purchaseOrder.supplierRepresentativeName || supplier?.contactPerson || supplier?.name || 'Supplier Representative',
        company_name: COMPANY.name,
        company_address: COMPANY.address,
        company_contact: COMPANY.contactNumber,
        company_email: COMPANY.email,
    };
};

const getElementChildren = (node, localName) =>
    Array.from(node.childNodes || []).filter(
        (child) => child.nodeType === 1 && child.localName === localName
    );

const getBodyChildren = (documentDom) => {
    const body = getElementChildren(documentDom.documentElement, 'body')[0];
    return getElementChildren(body, null);
};

const getBodyElementNodes = (documentDom) => {
    const body = getElementChildren(documentDom.documentElement, 'body')[0];
    return Array.from(body.childNodes || []).filter((child) => child.nodeType === 1);
};

const getTableRows = (tableNode) => getElementChildren(tableNode, 'tr');
const getTableCells = (rowNode) => getElementChildren(rowNode, 'tc');

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

const createTextParagraph = (documentDom, text, alignment = null) => createStyledParagraph(documentDom, text, { alignment });

const insertParagraphBefore = (referenceNode, paragraphNode) => {
    referenceNode.parentNode.insertBefore(paragraphNode, referenceNode);
};

const removeNode = (node) => {
    if (node?.parentNode) {
        node.parentNode.removeChild(node);
    }
};

const setParagraphText = (paragraphNode, text) => {
    setParagraphStyledText(paragraphNode, text, {});
};

const setParagraphStyledText = (paragraphNode, text, options = {}) => {
    while (paragraphNode.firstChild) {
        paragraphNode.removeChild(paragraphNode.firstChild);
    }
    const replacement = createStyledParagraph(paragraphNode.ownerDocument, text, options);
    while (replacement.firstChild) {
        paragraphNode.appendChild(replacement.firstChild);
    }
};

const setCellText = (cellNode, text, alignment = null) => {
    const documentDom = cellNode.ownerDocument;
    const preserved = Array.from(cellNode.childNodes || []).filter(
        (child) => child.nodeType === 1 && child.localName === 'tcPr'
    );
    while (cellNode.firstChild) {
        cellNode.removeChild(cellNode.firstChild);
    }
    preserved.forEach((node) => cellNode.appendChild(node));
    cellNode.appendChild(createTextParagraph(documentDom, text, alignment));
};

const setCellParagraphText = (cellNode, text, alignment = null) => {
    const paragraphs = getElementChildren(cellNode, 'p');
    if (paragraphs[0]) {
        setParagraphStyledText(paragraphs[0], text, { alignment });
        return;
    }

    setCellText(cellNode, text, alignment);
};

const createBorderlessTable = (documentDom, columnWidths) => {
    const table = documentDom.createElementNS(WORD_NAMESPACE, 'w:tbl');
    const tblPr = documentDom.createElementNS(WORD_NAMESPACE, 'w:tblPr');
    const tblBorders = documentDom.createElementNS(WORD_NAMESPACE, 'w:tblBorders');
    ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].forEach((side) => {
        const border = documentDom.createElementNS(WORD_NAMESPACE, `w:${side}`);
        border.setAttribute('w:val', 'nil');
        tblBorders.appendChild(border);
    });
    tblPr.appendChild(tblBorders);
    table.appendChild(tblPr);

    const tblGrid = documentDom.createElementNS(WORD_NAMESPACE, 'w:tblGrid');
    columnWidths.forEach((width) => {
        const gridCol = documentDom.createElementNS(WORD_NAMESPACE, 'w:gridCol');
        gridCol.setAttribute('w:w', String(width));
        tblGrid.appendChild(gridCol);
    });
    table.appendChild(tblGrid);
    return table;
};

const createTableCell = (documentDom, width, paragraphs = []) => {
    const cell = documentDom.createElementNS(WORD_NAMESPACE, 'w:tc');
    const tcPr = documentDom.createElementNS(WORD_NAMESPACE, 'w:tcPr');
    const tcW = documentDom.createElementNS(WORD_NAMESPACE, 'w:tcW');
    tcW.setAttribute('w:w', String(width));
    tcW.setAttribute('w:type', 'dxa');
    tcPr.appendChild(tcW);
    cell.appendChild(tcPr);
    if (paragraphs.length === 0) {
        cell.appendChild(createTextParagraph(documentDom, ''));
    } else {
        paragraphs.forEach((paragraph) => cell.appendChild(paragraph));
    }
    return cell;
};

const createTableRow = (documentDom, cells) => {
    const row = documentDom.createElementNS(WORD_NAMESPACE, 'w:tr');
    cells.forEach((cell) => row.appendChild(cell));
    return row;
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

const createImageRunXml = ({ relId, widthPx, heightPx, docPrId, horizontalAlign = 'left' }) => {
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

const renderPurchaseOrderDocument = async (purchaseOrder, outputType = 'company') => {
    await ensureDir(DOCUMENT_ROOT);

    const payload = await buildDocumentPayload(purchaseOrder);
    const payloadPath = path.join(DOCUMENT_ROOT, `${purchaseOrder.poNumber}-${outputType}.json`);
    const outputPath = path.join(DOCUMENT_ROOT, `${purchaseOrder.poNumber}-${outputType}.docx`);
    await fs.writeFile(payloadPath, JSON.stringify(payload, null, 2), 'utf-8');

    const zip = new AdmZip(TEMPLATE_PATH);
    const parser = new DOMParser();
    const serializer = new XMLSerializer();

    const documentDom = parser.parseFromString(zip.readAsText('word/document.xml'), 'text/xml');
    const relsDom = parser.parseFromString(zip.readAsText('word/_rels/document.xml.rels'), 'text/xml');
    const contentTypesDom = parser.parseFromString(zip.readAsText('[Content_Types].xml'), 'text/xml');

    ensurePngContentType(contentTypesDom);

    const bodyChildren = getBodyElementNodes(documentDom);
    const poDetailsTable = bodyChildren[8];
    const supplierTable = bodyChildren[11];
    const itemsTable = bodyChildren[14];
    const summaryTable = bodyChildren[17];
    const deliveryAddressParagraph = bodyChildren[20];
    const preparedByParagraph = bodyChildren[38];
    const dualSignatureParagraph = bodyChildren[39];
    const signerLabelsParagraph = bodyChildren[40];
    const approvedByParagraph = bodyChildren[41];
    const ownerSignatureParagraph = bodyChildren[42];
    const ownerLabelParagraph = bodyChildren[43];

    const poRows = getTableRows(poDetailsTable);
    const poDataCells = getTableCells(poRows[1]);
    setCellText(poDataCells[0], payload.po_number);
    setCellText(poDataCells[1], payload.date_issued);
    setCellText(poDataCells[2], payload.delivery_date);

    const supplierRows = getTableRows(supplierTable);
    [payload.supplier_name, payload.contact_person, payload.supplier_address, payload.supplier_contact].forEach((value, index) => {
        setCellText(getTableCells(supplierRows[index])[1], value);
    });

    const itemRows = getTableRows(itemsTable);
    for (let index = itemRows.length - 1; index > payload.items.length; index -= 1) {
        removeNode(itemRows[index]);
    }
    const trimmedItemRows = getTableRows(itemsTable);
    for (let index = 1; index < trimmedItemRows.length; index += 1) {
        const cells = getTableCells(trimmedItemRows[index]);
        const item = payload.items[index - 1];
        if (!item) continue;
        setCellParagraphText(cells[0], item.item_number, 'center');
        setCellParagraphText(cells[1], item.description);
        setCellParagraphText(cells[2], item.quantity, 'center');
        setCellParagraphText(cells[3], item.unit_price, 'right');
        setCellParagraphText(cells[4], item.amount, 'right');
    }

    const summaryRows = getTableRows(summaryTable);
    removeNode(summaryRows[2]);
    removeNode(summaryRows[1]);
    const trimmedSummaryRows = getTableRows(summaryTable);
    setCellParagraphText(getTableCells(trimmedSummaryRows[0])[0], 'Subtotal');
    setCellParagraphText(getTableCells(trimmedSummaryRows[0])[1], payload.subtotal, 'right');
    setCellParagraphText(getTableCells(trimmedSummaryRows[1])[0], 'Total Amount');
    setCellParagraphText(getTableCells(trimmedSummaryRows[1])[1], payload.total_amount, 'right');

    setParagraphText(deliveryAddressParagraph, `Delivery Address: ${payload.warehouse_name}${payload.warehouse_address ? `, ${payload.warehouse_address}` : ''}`);

    const imageRefs = [];
    if (payload.warehouse_manager_signature_path) {
        imageRefs.push({ key: 'warehouse', ref: addImageRelationship(zip, relsDom, payload.warehouse_manager_signature_path, `${purchaseOrder.poNumber}-warehouse`) });
    }
    if (payload.supplier_signature_path) {
        imageRefs.push({ key: 'supplier', ref: addImageRelationship(zip, relsDom, payload.supplier_signature_path, `${purchaseOrder.poNumber}-supplier`) });
    }
    if (payload.owner_signature_path) {
        imageRefs.push({ key: 'owner', ref: addImageRelationship(zip, relsDom, payload.owner_signature_path, `${purchaseOrder.poNumber}-owner`) });
    }

    const resolvedImageRefs = {};
    for (const imageRef of imageRefs) {
        if (!imageRef.ref) continue;
        const imageBuffer = await imageRef.ref.imageBufferPromise;
        const dimensions = parsePngDimensions(imageBuffer);
        const maxWidth = imageRef.key === 'owner' ? 118 : 92;
        const scaledWidth = Math.min(dimensions.width, maxWidth);
        const scaledHeight = Math.max(34, Math.round((dimensions.height / dimensions.width) * scaledWidth));
        zip.addFile(imageRef.ref.imageEntryPath, imageBuffer);
        resolvedImageRefs[imageRef.key] = {
            relId: imageRef.ref.relId,
            widthPx: scaledWidth,
            heightPx: scaledHeight,
        };
    }

    const approvalParent = preparedByParagraph.parentNode;
    const approvalInsertBefore = ownerLabelParagraph.nextSibling;
    [preparedByParagraph, dualSignatureParagraph, signerLabelsParagraph, approvedByParagraph, ownerSignatureParagraph, ownerLabelParagraph].forEach(removeNode);

    const approvalTable = createBorderlessTable(documentDom, [4300, 5100]);
    approvalTable.appendChild(createTableRow(documentDom, [
        createTableCell(documentDom, 4300, [createStyledParagraph(documentDom, 'Prepared By:', { bold: true, after: 120 })]),
        createTableCell(documentDom, 5100, [createStyledParagraph(documentDom, 'Supplier Confirmation:', { bold: true, alignment: 'center', after: 120 })]),
    ]));

    const managerImageParagraph = createStyledParagraph(documentDom, '', { after: 70 });
    if (resolvedImageRefs.warehouse) {
        setParagraphRunsFromXml(managerImageParagraph, [createImageRunXml({ ...resolvedImageRefs.warehouse, docPrId: 101, horizontalAlign: 'left' })]);
    }
    const supplierImageParagraph = createStyledParagraph(documentDom, '', { alignment: 'center', after: 18 });
    if (resolvedImageRefs.supplier) {
        setParagraphRunsFromXml(supplierImageParagraph, [createImageRunXml({ ...resolvedImageRefs.supplier, docPrId: 102, horizontalAlign: 'left' })]);
    }
    approvalTable.appendChild(createTableRow(documentDom, [
        createTableCell(documentDom, 4300, [
            createStyledParagraph(documentDom, '', { after: 10 }),
            managerImageParagraph,
        ]),
        createTableCell(documentDom, 5100, [
            createStyledParagraph(documentDom, '', { after: 10 }),
            supplierImageParagraph,
        ]),
    ]));

    approvalTable.appendChild(createTableRow(documentDom, [
        createTableCell(documentDom, 4300, [createStyledParagraph(documentDom, payload.warehouse_manager_name, { underline: true, before: 0 })]),
        createTableCell(documentDom, 5100, [createStyledParagraph(documentDom, payload.supplier_representative, { underline: true, alignment: 'center', before: 0 })]),
    ]));

    approvalTable.appendChild(createTableRow(documentDom, [
        createTableCell(documentDom, 4300, [createStyledParagraph(documentDom, 'Warehouse Manager')]),
        createTableCell(documentDom, 5100, [createStyledParagraph(documentDom, 'Supplier Representative', { alignment: 'center' })]),
    ]));

    approvalParent.insertBefore(approvalTable, approvalInsertBefore);

    const approvedByHeading = createStyledParagraph(documentDom, 'Approved By:', { alignment: 'center', bold: true, before: 240, after: 120 });
    approvalParent.insertBefore(approvedByHeading, approvalInsertBefore);

    const ownerImageParagraph = createStyledParagraph(documentDom, '', { alignment: 'center', after: 70 });
    if (resolvedImageRefs.owner) {
        setParagraphRunsFromXml(ownerImageParagraph, [createImageRunXml({ ...resolvedImageRefs.owner, docPrId: 103, horizontalAlign: 'center' })]);
    }
    approvalParent.insertBefore(createStyledParagraph(documentDom, '', { alignment: 'center', after: 10 }), approvalInsertBefore);
    approvalParent.insertBefore(ownerImageParagraph, approvalInsertBefore);
    approvalParent.insertBefore(createStyledParagraph(documentDom, payload.owner_name, { alignment: 'center', underline: true, after: 40, before: 0 }), approvalInsertBefore);
    approvalParent.insertBefore(createStyledParagraph(documentDom, 'Lumiere Corporation CEO', { alignment: 'center' }), approvalInsertBefore);

    zip.updateFile('word/document.xml', Buffer.from(serializer.serializeToString(documentDom), 'utf-8'));
    zip.updateFile('word/_rels/document.xml.rels', Buffer.from(serializer.serializeToString(relsDom), 'utf-8'));
    zip.updateFile('[Content_Types].xml', Buffer.from(serializer.serializeToString(contentTypesDom), 'utf-8'));
    zip.writeZip(outputPath);

    return outputPath;
};

const sendPurchaseOrderToSupplier = async (purchaseOrder) => {
    const order = await Order.findById(purchaseOrder.order).populate('supplier').populate('product').lean();
    if (!order?.supplier?.email) {
        throw new Error('Supplier email is missing.');
    }

    const requiredEnv = ['BREVO_API_KEY', 'BREVO_SENDER_EMAIL'];
    const missing = requiredEnv.filter((key) => !process.env[key]);
    if (missing.length > 0) {
        throw new Error(`Email configuration is incomplete. Missing: ${missing.join(', ')}`);
    }

    const token = purchaseOrder.supplierSigningToken || crypto.randomBytes(24).toString('hex');
    const signingLink = `${getFrontendBaseUrl().replace(/\/$/, '')}/supplier-sign/${token}`;
    const attachmentPath = purchaseOrder.companyDocumentPath;
    const attachmentContent = attachmentPath && await fileExists(attachmentPath)
        ? (await fs.readFile(attachmentPath)).toString('base64')
        : '';

    const response = await fetch(BREVO_ENDPOINT, {
        method: 'POST',
        headers: {
            accept: 'application/json',
            'api-key': process.env.BREVO_API_KEY,
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            sender: {
                email: process.env.BREVO_SENDER_EMAIL,
                name: process.env.BREVO_SENDER_NAME || COMPANY.name,
            },
            to: [{ email: order.supplier.email, name: order.supplier.contactPerson || order.supplier.name }],
            subject: `Purchase Order ${purchaseOrder.poNumber} for ${order.product?.name || 'Inventory Restock'}`,
            htmlContent: `
                <p>Hello ${order.supplier.contactPerson || order.supplier.name},</p>
                <p>Please review and sign purchase order <strong>${purchaseOrder.poNumber}</strong>.</p>
                <p><a href="${signingLink}">Open supplier signing page</a></p>
                <p>The signed company purchase order is attached for your reference.</p>
            `,
            attachment: attachmentContent
                ? [{ name: path.basename(attachmentPath), content: attachmentContent }]
                : [],
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Brevo email send failed: ${errorText}`);
    }

    purchaseOrder.supplierSigningToken = token;
    purchaseOrder.supplierTokenExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);
    purchaseOrder.emailSentAt = new Date();
    purchaseOrder.status = 'Awaiting Supplier Signature';
    await purchaseOrder.save();

    return signingLink;
};

const attachPurchaseOrdersToOrders = async (orders) => {
    const orderIds = orders.map((order) => order._id);
    const purchaseOrders = await PurchaseOrder.find({ order: { $in: orderIds } }).lean();
    const purchaseOrderMap = new Map(
        purchaseOrders.map((purchaseOrder) => [String(purchaseOrder.order), purchaseOrder])
    );

    return orders.map((order) => {
        const plainOrder = typeof order.toObject === 'function' ? order.toObject() : order;
        const purchaseOrder = purchaseOrderMap.get(String(plainOrder._id)) || null;

        return {
            ...plainOrder,
            purchaseOrder: purchaseOrder
                ? {
                    ...purchaseOrder,
                    companyDocumentUrl: getPublicPath(purchaseOrder.companyDocumentPath),
                    finalDocumentUrl: getPublicPath(purchaseOrder.finalDocumentPath),
                }
                : null,
        };
    });
};

module.exports = {
    attachPurchaseOrdersToOrders,
    clearPurchaseOrderSignatureStorage,
    createPurchaseOrderForInboundOrder,
    getFrontendBaseUrl,
    getPublicPath,
    renderPurchaseOrderDocument,
    sendPurchaseOrderToSupplier,
    writeBase64Signature,
};
