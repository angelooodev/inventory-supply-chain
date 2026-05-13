const Warehouse = require('../models/warehouseModel');

const requireSuperAdmin = (req, res) => {
    if (!req.user || req.user.role !== 'SuperAdmin') {
        res.status(403).json({ message: 'Access Denied: Only the Super Admin can manage warehouses.' });
        return false;
    }
    return true;
};

const getWarehouses = async (req, res) => {
    try {
        const warehouses = await Warehouse.find().sort({ name: 1 });
        res.status(200).json(warehouses);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const createWarehouse = async (req, res) => {
    try {
        if (!requireSuperAdmin(req, res)) return;
        const { name, address } = req.body;
        if (!name) {
            return res.status(400).json({ message: 'Warehouse name is required.' });
        }
        const warehouse = await Warehouse.create({ name: name.trim(), address: address || '' });
        res.status(201).json(warehouse);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateWarehouse = async (req, res) => {
    try {
        if (!requireSuperAdmin(req, res)) return;

        const warehouse = await Warehouse.findById(req.params.id);
        if (!warehouse) {
            return res.status(404).json({ message: 'Warehouse not found.' });
        }

        const nextName = req.body.name?.trim();
        if (!nextName) {
            return res.status(400).json({ message: 'Warehouse name is required.' });
        }

        const duplicateWarehouse = await Warehouse.findOne({
            name: nextName,
            _id: { $ne: warehouse._id },
        });
        if (duplicateWarehouse) {
            return res.status(400).json({ message: 'Warehouse name already exists.' });
        }

        warehouse.name = nextName;
        warehouse.address = req.body.address?.trim() || '';
        await warehouse.save();

        res.status(200).json(warehouse);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const deleteWarehouse = async (req, res) => {
    try {
        if (!requireSuperAdmin(req, res)) return;
        const warehouse = await Warehouse.findById(req.params.id);
        if (!warehouse) {
            return res.status(404).json({ message: 'Warehouse not found.' });
        }
        await warehouse.deleteOne();
        res.status(200).json({ message: 'Warehouse deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { getWarehouses, createWarehouse, updateWarehouse, deleteWarehouse };
