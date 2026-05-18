const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');
const ensureSuperAdmin = require('./utils/ensureSuperAdmin');
const ensureWarehouses = require('./utils/ensureWarehouses');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/files', express.static(path.resolve(__dirname, 'storage')));
app.get('/healthz', (_req, res) => {
    res.status(200).json({ ok: true });
});

// Product routes here
app.use('/api/products', require('./routes/productRoutes'));
// Supplier routes here
app.use('/api/suppliers', require('./routes/supplierRoutes'));
// Warehouse routes here
app.use('/api/warehouses', require('./routes/warehouseRoutes'));
// Order routes here
app.use('/api/orders', require('./routes/orderRoutes'));
// Purchase order routes here
app.use('/api/purchase-orders', require('./routes/purchaseOrderRoutes'));
// Transfer order routes here
app.use('/api/transfer-orders', require('./routes/transferOrderRoutes'));
// User routes here
app.use('/api/users', require('./routes/userRoutes'));

const PORT = process.env.PORT || 5000;

const startServer = async () => {
    await connectDB();
    await ensureSuperAdmin();
    await ensureWarehouses();

    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
};

startServer();
