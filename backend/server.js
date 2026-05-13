const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');
const ensureSuperAdmin = require('./utils/ensureSuperAdmin');
const ensureWarehouses = require('./utils/ensureWarehouses');

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json()); 

// Product routes here
app.use('/api/products', require('./routes/productRoutes'));
// Supplier routes here
app.use('/api/suppliers', require('./routes/supplierRoutes'));
// Warehouse routes here
app.use('/api/warehouses', require('./routes/warehouseRoutes'));
// Order routes here
app.use('/api/orders', require('./routes/orderRoutes'));
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
