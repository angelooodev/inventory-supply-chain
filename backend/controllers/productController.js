const Product = require('../models/productModel');
const Supplier = require('../models/supplierModel');
const Warehouse = require('../models/warehouseModel');
const { UNIT_OF_MEASURE_OPTIONS } = require('../constants/unitOfMeasure');
const AdmZip = require('adm-zip');
const { XMLParser } = require('fast-xml-parser');

const syncProductWarehouses = async (product, warehouseRecords) => {
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

const requireProductManager = (req, res) => {
    if (!req.user || !['SuperAdmin', 'Manager'].includes(req.user.role)) {
        res.status(403).json({ message: 'Access Denied: Only Super Admins and Managers can manage products.' });
        return false;
    }
    return true;
};

const normalizeUnitOfMeasure = (value) => {
    if (!value || typeof value !== 'string') {
        return 'unit';
    }

    return value.trim();
};

const normalizeSku = (value) => String(value || '').trim().toUpperCase();
const normalizeImportHeader = (value) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[()]/g, '');
const normalizeSupplierIds = (suppliers) => {
    if (!Array.isArray(suppliers)) return [];

    return [...new Set(
        suppliers
            .map((supplierId) => String(supplierId || '').trim())
            .filter(Boolean)
    )];
};
const normalizeSupplierPricing = (supplierPricing) => {
    if (!Array.isArray(supplierPricing)) return [];

    const entryMap = new Map();

    supplierPricing.forEach((entry) => {
        const supplierId = String(entry?.supplier || '').trim();
        const parsedCost = Number(entry?.cost);

        if (!supplierId || !Number.isFinite(parsedCost) || parsedCost < 0) {
            return;
        }

        entryMap.set(supplierId, {
            supplier: supplierId,
            cost: parsedCost,
            updatedAt: new Date(),
        });
    });

    return [...entryMap.values()];
};

const getVisibleWarehouses = async (req) => {
    if (!req.user || req.user.role !== 'Manager') {
        return null;
    }

    const assignedWarehouses = await Warehouse.find({ manager: req.user._id }).select('name').lean();
    return assignedWarehouses.map((warehouse) => warehouse.name);
};

const xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    trimValues: false,
});

const ensureArray = (value) => {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
};

const getNodeByLocalName = (node, localName) => {
    if (!node || typeof node !== 'object') return undefined;

    if (Object.prototype.hasOwnProperty.call(node, localName)) {
        return node[localName];
    }

    const matchingKey = Object.keys(node).find((key) => key === localName || key.endsWith(`:${localName}`));
    return matchingKey ? node[matchingKey] : undefined;
};

const getCellTextValue = (cell, sharedStrings) => {
    if (!cell) return '';

    if (cell.t === 's') {
        const sharedIndex = Number(getNodeByLocalName(cell, 'v'));
        return Number.isFinite(sharedIndex) ? String(sharedStrings[sharedIndex] || '') : '';
    }

    if (cell.t === 'inlineStr') {
        const inlineStringNode = getNodeByLocalName(cell, 'is');
        const inlineText = getNodeByLocalName(inlineStringNode, 't')
            ?? ensureArray(getNodeByLocalName(inlineStringNode, 'r')).map((run) => getNodeByLocalName(run, 't') || '').join('');
        return String(inlineText || '');
    }

    const rawValueNode = getNodeByLocalName(cell, 'v');
    if (typeof rawValueNode === 'object' && rawValueNode !== null && 'text' in rawValueNode) {
        return String(rawValueNode.text || '');
    }

    return String(rawValueNode ?? '');
};

const getColumnLetters = (cellRef) => String(cellRef || '').match(/[A-Z]+/i)?.[0]?.toUpperCase() || '';

const parseSharedStrings = (zip) => {
    const entry = zip.getEntry('xl/sharedStrings.xml');
    if (!entry) return [];

    const parsed = xmlParser.parse(entry.getData().toString('utf8'));
    const sharedItems = ensureArray(getNodeByLocalName(getNodeByLocalName(parsed, 'sst'), 'si'));

    return sharedItems.map((item) => {
        const plainText = getNodeByLocalName(item, 't');
        if (typeof plainText === 'string') return plainText;
        const richTextRuns = ensureArray(getNodeByLocalName(item, 'r'));
        return richTextRuns.map((run) => getNodeByLocalName(run, 't') || '').join('');
    });
};

const resolveFirstWorksheetPath = (zip) => {
    const workbookEntry = zip.getEntry('xl/workbook.xml');
    const relationshipsEntry = zip.getEntry('xl/_rels/workbook.xml.rels');

    if (!workbookEntry || !relationshipsEntry) {
        throw new Error('Invalid Excel file. Workbook structure is missing.');
    }

    const workbook = xmlParser.parse(workbookEntry.getData().toString('utf8'));
    const relationships = xmlParser.parse(relationshipsEntry.getData().toString('utf8'));
    const workbookNode = getNodeByLocalName(workbook, 'workbook');
    const sheetsNode = getNodeByLocalName(workbookNode, 'sheets');
    const firstSheet = ensureArray(getNodeByLocalName(sheetsNode, 'sheet'))[0];
    const relationshipsNode = getNodeByLocalName(relationships, 'Relationships');
    const relationshipEntries = ensureArray(getNodeByLocalName(relationshipsNode, 'Relationship'));
    const relationshipId = firstSheet?.['r:id'] || firstSheet?.rid || firstSheet?.id;
    const relationship = relationshipEntries.find((entry) => entry.Id === relationshipId)
        || relationshipEntries.find((entry) => String(entry.Type || '').includes('/worksheet'));

    if (!relationship?.Target) {
        throw new Error('Invalid Excel file. Worksheet target is missing.');
    }

    const normalizedTarget = relationship.Target.replace(/^\/+/, '').replace(/\\/g, '/');
    return normalizedTarget.startsWith('xl/')
        ? normalizedTarget
        : `xl/${normalizedTarget.replace(/^xl\//, '')}`;
};

const parseWorkbookRows = (fileBuffer) => {
    const zip = new AdmZip(fileBuffer);
    const sharedStrings = parseSharedStrings(zip);
    const worksheetPath = resolveFirstWorksheetPath(zip);
    const worksheetEntry = zip.getEntry(worksheetPath);

    if (!worksheetEntry) {
        throw new Error('Invalid Excel file. The first worksheet could not be loaded.');
    }

    const worksheet = xmlParser.parse(worksheetEntry.getData().toString('utf8'));
    const worksheetNode = getNodeByLocalName(worksheet, 'worksheet');
    const sheetDataNode = getNodeByLocalName(worksheetNode, 'sheetData');
    const sheetRows = ensureArray(getNodeByLocalName(sheetDataNode, 'row'));
    if (!sheetRows.length) return [];

    const parsedRows = sheetRows.map((row) => {
        const cells = ensureArray(getNodeByLocalName(row, 'c'));
        const rowObject = {};

        cells.forEach((cell) => {
            rowObject[getColumnLetters(cell.r)] = getCellTextValue(cell, sharedStrings);
        });

        return rowObject;
    });

    const headerColumns = parsedRows[0] || {};
    const orderedColumns = Object.keys(headerColumns);
    const headers = orderedColumns.map((column) => normalizeImportHeader(headerColumns[column]));

    return parsedRows
        .slice(1)
        .map((rowObject) => {
            const mappedRow = {};
            orderedColumns.forEach((column, index) => {
                mappedRow[headers[index]] = String(rowObject[column] || '').trim();
            });
            return mappedRow;
        })
        .filter((rowObject) => Object.values(rowObject).some((value) => String(value || '').trim()));
};

const getImportedField = (row, keys) => {
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(row, key) && String(row[key] || '').trim()) {
            return String(row[key]).trim();
        }
    }

    return '';
};

const mapImportedProductRow = (row) => ({
    name: getImportedField(row, ['product name', 'name', 'product']),
    sku: getImportedField(row, ['product code sku', 'product code', 'sku', 'item code sku', 'item code']),
    category: getImportedField(row, ['category']),
    price: getImportedField(row, ['unit price', 'price', 'selling price']),
    reorderThreshold: getImportedField(row, ['low stock threshold', 'reorder threshold', 'threshold']),
    unitOfMeasure: getImportedField(row, ['unit of measure', 'unit']),
});

const escapeXml = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const buildInlineStringCell = (cellRef, value) => (
    `<c r="${cellRef}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`
);

const buildProductImportTemplateBuffer = () => {
    const zip = new AdmZip();
    const headers = ['Product Name', 'Product Code (SKU)', 'Category', 'Unit Price', 'Low Stock Threshold', 'Unit Of Measure'];
    const examples = ['Anime LED Neon Sign - Sample', 'EXM-001', 'Wall Decor', '2499', '10', 'unit'];
    const headerCells = headers.map((value, index) => buildInlineStringCell(`${String.fromCharCode(65 + index)}1`, value)).join('');
    const exampleCells = examples.map((value, index) => buildInlineStringCell(`${String.fromCharCode(65 + index)}2`, value)).join('');

    zip.addFile('[Content_Types].xml', Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`,
        'utf8'
    ));

    zip.addFile('_rels/.rels', Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
        'utf8'
    ));

    zip.addFile('docProps/core.xml', Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Lumiere Product Import Template</dc:title>
  <dc:creator>Lumiere Inventory System</dc:creator>
</cp:coreProperties>`,
        'utf8'
    ));

    zip.addFile('docProps/app.xml', Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Lumiere Inventory System</Application>
</Properties>`,
        'utf8'
    ));

    zip.addFile('xl/workbook.xml', Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Products" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`,
        'utf8'
    ));

    zip.addFile('xl/_rels/workbook.xml.rels', Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
        'utf8'
    ));

    zip.addFile('xl/worksheets/sheet1.xml', Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:F2"/>
  <sheetViews>
    <sheetView workbookViewId="0"/>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>
    <col min="1" max="1" width="32" customWidth="1"/>
    <col min="2" max="2" width="22" customWidth="1"/>
    <col min="3" max="3" width="22" customWidth="1"/>
    <col min="4" max="4" width="16" customWidth="1"/>
    <col min="5" max="5" width="22" customWidth="1"/>
    <col min="6" max="6" width="18" customWidth="1"/>
  </cols>
  <sheetData>
    <row r="1">${headerCells}</row>
    <row r="2">${exampleCells}</row>
  </sheetData>
</worksheet>`,
        'utf8'
    ));

    return zip.toBuffer();
};

// @desc    Get all products
// @route   GET /api/products
const getProducts = async (req, res) => {
    try {
        const [products, warehouseRecords] = await Promise.all([
            Product.find()
                .populate('suppliers', 'name contactPerson email phone address leadTimeDays')
                .populate('supplierPricing.supplier', 'name contactPerson email phone address leadTimeDays'),
            Warehouse.find().sort({ name: 1 }).lean(),
        ]);
        const visibleWarehouses = await getVisibleWarehouses(req);
        
        // Add a virtual field for 'totalStock' and 'isLowStock' for the frontend
        const formattedProducts = await Promise.all(products.map(async (p) => {
            const normalizedWarehouses = await syncProductWarehouses(p, warehouseRecords);
            const scopedWarehouses = visibleWarehouses
                ? normalizedWarehouses.filter((warehouse) => visibleWarehouses.includes(warehouse.name))
                : normalizedWarehouses;
            const total = scopedWarehouses.reduce((sum, wh) => sum + wh.stock, 0);
            const normalizedSupplierPricing = (p.supplierPricing || []).filter((entry) => entry?.supplier);
            const cheapestSupplierQuote = normalizedSupplierPricing.reduce((lowestEntry, entry) => {
                if (!lowestEntry || entry.cost < lowestEntry.cost) {
                    return entry;
                }

                return lowestEntry;
            }, null);
            return {
                ...p._doc,
                warehouses: normalizedWarehouses,
                supplierPricing: normalizedSupplierPricing,
                cheapestSupplierQuote,
                totalStock: total,
                isLowStock: total < p.reorderThreshold
            };
        }));
        
        res.status(200).json(formattedProducts);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Create a new product
// @route   POST /api/products
const createProduct = async (req, res) => {
    try {
        if (!requireProductManager(req, res)) return;

        const { name, sku, category, reorderThreshold, price, unitOfMeasure } = req.body;
        const normalizedSku = normalizeSku(sku);

        if (!name || !normalizedSku || !category || !price) {
            return res.status(400).json({ message: 'Please add all required fields' });
        }

        const existingProduct = await Product.findOne({ sku: normalizedSku });
        if (existingProduct) {
            return res.status(400).json({ message: 'SKU already exists' });
        }

        const threshold = Math.max(0, Number(reorderThreshold) || 10);
        const productPrice = Number(price);
        const normalizedUnitOfMeasure = normalizeUnitOfMeasure(unitOfMeasure);

        if (!UNIT_OF_MEASURE_OPTIONS.includes(normalizedUnitOfMeasure)) {
            return res.status(400).json({ message: 'Invalid unit of measure selected.' });
        }

        const warehouseRecords = await Warehouse.find().sort({ name: 1 });
        if (warehouseRecords.length === 0) {
            return res.status(400).json({ message: 'No warehouses found. Please register warehouses first.' });
        }

        const initialWarehouses = warehouseRecords.map((warehouse) => ({ name: warehouse.name, stock: 0 }));

        const product = await Product.create({
            name,
            sku: normalizedSku,
            category: category.trim(),
            warehouses: initialWarehouses,
            reorderThreshold: threshold,
            price: productPrice,
            unitOfMeasure: normalizedUnitOfMeasure,
            suppliers: [],
            supplierPricing: [],
        });

        res.status(201).json(product);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Download product import Excel template
// @route   GET /api/products/import-template
const downloadProductImportTemplate = async (req, res) => {
    try {
        if (!requireProductManager(req, res)) return;

        const templateBuffer = buildProductImportTemplateBuffer();
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="lumiere-product-import-template.xlsx"');
        res.status(200).send(templateBuffer);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Bulk import products from Excel
// @route   POST /api/products/import
const importProducts = async (req, res) => {
    try {
        if (!requireProductManager(req, res)) return;

        const { fileName, fileData } = req.body || {};
        if (!fileName || !fileData) {
            return res.status(400).json({ message: 'Excel file data is required.' });
        }

        if (!String(fileName).toLowerCase().endsWith('.xlsx')) {
            return res.status(400).json({ message: 'Only .xlsx Excel files are supported for bulk import.' });
        }

        let rows;
        try {
            const workbookBuffer = Buffer.from(String(fileData), 'base64');
            rows = parseWorkbookRows(workbookBuffer);
        } catch (error) {
            return res.status(400).json({ message: error.message || 'The Excel file could not be read.' });
        }

        if (!rows.length) {
            return res.status(400).json({ message: 'The Excel file does not contain any product rows to import.' });
        }

        const warehouseRecords = await Warehouse.find().sort({ name: 1 }).lean();
        if (warehouseRecords.length === 0) {
            return res.status(400).json({ message: 'No warehouses found. Please register warehouses first.' });
        }

        const initialWarehouses = warehouseRecords.map((warehouse) => ({ name: warehouse.name, stock: 0 }));
        const existingSkuSet = new Set(
            (await Product.find().select('sku').lean()).map((product) => normalizeSku(product.sku))
        );
        const importedSkuSet = new Set();
        const productsToCreate = [];
        const errors = [];

        rows.forEach((row, rowIndex) => {
            const mappedRow = mapImportedProductRow(row);
            const normalizedSku = normalizeSku(mappedRow.sku);
            const normalizedUnitOfMeasure = normalizeUnitOfMeasure(mappedRow.unitOfMeasure);
            const parsedPrice = Number(mappedRow.price);
            const parsedThreshold = Math.max(0, Number(mappedRow.reorderThreshold) || 10);
            const rowNumber = rowIndex + 2;

            if (!mappedRow.name || !normalizedSku || !mappedRow.category || !mappedRow.price) {
                errors.push(`Row ${rowNumber}: Product name, SKU, category, and unit price are required.`);
                return;
            }

            if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
                errors.push(`Row ${rowNumber}: Unit price must be greater than 0.`);
                return;
            }

            if (!UNIT_OF_MEASURE_OPTIONS.includes(normalizedUnitOfMeasure)) {
                errors.push(`Row ${rowNumber}: Invalid unit of measure "${mappedRow.unitOfMeasure || normalizedUnitOfMeasure}".`);
                return;
            }

            if (existingSkuSet.has(normalizedSku)) {
                errors.push(`Row ${rowNumber}: SKU ${normalizedSku} already exists.`);
                return;
            }

            if (importedSkuSet.has(normalizedSku)) {
                errors.push(`Row ${rowNumber}: SKU ${normalizedSku} is duplicated in the Excel file.`);
                return;
            }

            importedSkuSet.add(normalizedSku);
            productsToCreate.push({
                name: mappedRow.name,
                sku: normalizedSku,
                category: mappedRow.category,
                warehouses: initialWarehouses,
                reorderThreshold: parsedThreshold,
                price: parsedPrice,
                unitOfMeasure: normalizedUnitOfMeasure,
                suppliers: [],
                supplierPricing: [],
            });
        });

        if (!productsToCreate.length) {
            return res.status(400).json({
                message: 'No valid products were found in the Excel file.',
                createdCount: 0,
                errors,
            });
        }

        const createdProducts = await Product.insertMany(productsToCreate);
        res.status(201).json({
            message: `${createdProducts.length} product${createdProducts.length === 1 ? '' : 's'} imported successfully.`,
            createdCount: createdProducts.length,
            skippedCount: errors.length,
            errors,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update a product (e.g., updating stock levels)
// @route   PUT /api/products/:id
const updateProduct = async (req, res) => {
    try {
        const isSupplierSelfService = req.user?.role === 'Supplier';
        if (!isSupplierSelfService && !requireProductManager(req, res)) return;

        const product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        if (isSupplierSelfService) {
            const allowedFields = ['suppliers', 'supplierPricing'];
            const requestedFields = Object.keys(req.body || {});
            const onlySupplierPricingRequested = requestedFields.length > 0 && requestedFields.every((field) => allowedFields.includes(field));

            if (!onlySupplierPricingRequested) {
                return res.status(403).json({ message: 'Access denied: suppliers can only update their own item cost.' });
            }

            const supplierId = String(req.user?.supplier || '').trim();
            if (!supplierId) {
                return res.status(403).json({ message: 'Access denied: supplier account is not linked properly.' });
            }

            const linkedSupplierIds = normalizeSupplierIds((product.suppliers || []).map((supplier) => supplier?._id || supplier));
            if (!linkedSupplierIds.includes(supplierId)) {
                if (!Object.prototype.hasOwnProperty.call(req.body, 'suppliers')) {
                    return res.status(403).json({ message: 'Access denied: this item is not linked to your supplier account.' });
                }
            }

            let nextSuppliers = linkedSupplierIds;
            if (Object.prototype.hasOwnProperty.call(req.body, 'suppliers')) {
                const requestedSupplierIds = normalizeSupplierIds(req.body.suppliers);
                const currentOtherSupplierIds = linkedSupplierIds.filter((id) => id !== supplierId).sort();
                const requestedOtherSupplierIds = requestedSupplierIds.filter((id) => id !== supplierId).sort();

                if (
                    currentOtherSupplierIds.length !== requestedOtherSupplierIds.length ||
                    currentOtherSupplierIds.some((id, index) => id !== requestedOtherSupplierIds[index])
                ) {
                    return res.status(403).json({ message: 'Access denied: suppliers can only link or unlink their own supplier account.' });
                }

                nextSuppliers = requestedSupplierIds;
            }

            const existingPricing = normalizeSupplierPricing((product.supplierPricing || []).map((entry) => ({
                supplier: entry?.supplier?._id || entry?.supplier,
                cost: entry?.cost,
            })));
            let nextPricing = existingPricing.filter((entry) => entry.supplier !== supplierId);

            if (Object.prototype.hasOwnProperty.call(req.body, 'supplierPricing')) {
                const normalizedSupplierPricing = normalizeSupplierPricing(req.body.supplierPricing);
                if (normalizedSupplierPricing.length !== 1 || normalizedSupplierPricing[0].supplier !== supplierId) {
                    return res.status(403).json({ message: 'Access denied: suppliers can only save their own cost entry.' });
                }

                if (!nextSuppliers.includes(supplierId)) {
                    return res.status(403).json({ message: 'Link your supplier account to the product before saving a cost.' });
                }

                nextPricing = [
                    ...nextPricing,
                    normalizedSupplierPricing[0],
                ];
            } else if (nextSuppliers.includes(supplierId)) {
                const existingOwnPricing = existingPricing.find((entry) => entry.supplier === supplierId);
                if (existingOwnPricing) {
                    nextPricing = [
                        ...nextPricing,
                        existingOwnPricing,
                    ];
                }
            }

            const updatedProduct = await Product.findByIdAndUpdate(
                req.params.id,
                {
                    suppliers: nextSuppliers,
                    supplierPricing: nextPricing,
                },
                { new: true }
            )
                .populate('suppliers', 'name contactPerson email phone address leadTimeDays')
                .populate('supplierPricing.supplier', 'name contactPerson email phone address leadTimeDays');

            return res.status(200).json(updatedProduct);
        }

        const nextProductData = { ...req.body };

        if (Object.prototype.hasOwnProperty.call(req.body, 'sku')) {
            const normalizedSku = normalizeSku(req.body.sku);
            if (!normalizedSku) {
                return res.status(400).json({ message: 'Product code (SKU) is required.' });
            }

            const existingProduct = await Product.findOne({
                sku: normalizedSku,
                _id: { $ne: req.params.id },
            });

            if (existingProduct) {
                return res.status(400).json({ message: 'SKU already exists' });
            }

            nextProductData.sku = normalizedSku;
        }

        if (Object.prototype.hasOwnProperty.call(req.body, 'suppliers')) {
            const normalizedSupplierIds = normalizeSupplierIds(req.body.suppliers);

            if (normalizedSupplierIds.length > 0) {
                const supplierCount = await Supplier.countDocuments({ _id: { $in: normalizedSupplierIds } });
                if (supplierCount !== normalizedSupplierIds.length) {
                    return res.status(400).json({ message: 'One or more suppliers are invalid.' });
                }
            }

            nextProductData.suppliers = normalizedSupplierIds;
            nextProductData.supplierPricing = (product.supplierPricing || []).filter((entry) =>
                normalizedSupplierIds.includes(String(entry.supplier))
            );
        }

        if (Object.prototype.hasOwnProperty.call(req.body, 'supplierPricing')) {
            const normalizedSupplierPricing = normalizeSupplierPricing(req.body.supplierPricing);
            const effectiveSupplierIds = Object.prototype.hasOwnProperty.call(nextProductData, 'suppliers')
                ? nextProductData.suppliers
                : normalizeSupplierIds((product.suppliers || []).map((supplier) => supplier?._id || supplier));

            const allPricingLinked = normalizedSupplierPricing.every((entry) => effectiveSupplierIds.includes(entry.supplier));
            if (!allPricingLinked) {
                return res.status(400).json({ message: 'Supplier cost entries must belong to linked suppliers only.' });
            }

            if (normalizedSupplierPricing.length > 0) {
                const supplierCount = await Supplier.countDocuments({
                    _id: { $in: normalizedSupplierPricing.map((entry) => entry.supplier) },
                });
                if (supplierCount !== normalizedSupplierPricing.length) {
                    return res.status(400).json({ message: 'One or more supplier cost entries are invalid.' });
                }
            }

            nextProductData.supplierPricing = normalizedSupplierPricing;
        }

        if (Object.prototype.hasOwnProperty.call(req.body, 'unitOfMeasure')) {
            const normalizedUnitOfMeasure = normalizeUnitOfMeasure(req.body.unitOfMeasure);

            if (!UNIT_OF_MEASURE_OPTIONS.includes(normalizedUnitOfMeasure)) {
                return res.status(400).json({ message: 'Invalid unit of measure selected.' });
            }

            nextProductData.unitOfMeasure = normalizedUnitOfMeasure;
        }

        const updatedProduct = await Product.findByIdAndUpdate(
            req.params.id,
            nextProductData,
            { new: true }
        )
            .populate('suppliers', 'name contactPerson email phone address leadTimeDays')
            .populate('supplierPricing.supplier', 'name contactPerson email phone address leadTimeDays');

        res.status(200).json(updatedProduct);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Delete a product
// @route   DELETE /api/products/:id
const deleteProduct = async (req, res) => {
    try {
        if (!requireProductManager(req, res)) return;

        const product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        await product.deleteOne();
        res.status(200).json({ id: req.params.id, message: 'Product deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getProducts,
    createProduct,
    downloadProductImportTemplate,
    importProducts,
    updateProduct,
    deleteProduct,
};
