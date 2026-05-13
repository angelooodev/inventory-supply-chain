const Warehouse = require('../models/warehouseModel');

const DEFAULT_WAREHOUSES = [
    {
        name: 'Warehouse A',
        address: 'Pope John Paul II Avenue, Cebu City, Cebu',
    },
    {
        name: 'Warehouse B',
        address: 'N. Bacalso Avenue, Cebu City, Cebu',
    },
];

const ensureWarehouses = async () => {
    for (const warehouseData of DEFAULT_WAREHOUSES) {
        const existingWarehouse = await Warehouse.findOne({ name: warehouseData.name });

        if (!existingWarehouse) {
            await Warehouse.create(warehouseData);
            console.log(`Warehouse created: ${warehouseData.name}`);
            continue;
        }

        if (existingWarehouse.address !== warehouseData.address) {
            existingWarehouse.address = warehouseData.address;
            await existingWarehouse.save();
            console.log(`Warehouse updated: ${warehouseData.name}`);
        }
    }
};

module.exports = ensureWarehouses;
