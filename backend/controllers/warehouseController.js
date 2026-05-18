const Warehouse = require('../models/warehouseModel');
const User = require('../models/userModel');

const requireSuperAdmin = (req, res) => {
    if (!req.user || req.user.role !== 'SuperAdmin') {
        res.status(403).json({ message: 'Access Denied: Only the Super Admin can manage warehouses.' });
        return false;
    }
    return true;
};

const resolveManagerAssignment = async (managerId, currentWarehouseId = null) => {
    if (!managerId) return null;

    const manager = await User.findById(managerId).select('_id role name email');
    if (!manager || manager.role !== 'Manager') {
        const error = new Error('Assigned warehouse manager must be a valid Manager account.');
        error.statusCode = 400;
        throw error;
    }

    const existingAssignment = await Warehouse.findOne({
        manager: manager._id,
        ...(currentWarehouseId ? { _id: { $ne: currentWarehouseId } } : {}),
    });

    if (existingAssignment) {
        const error = new Error(`${manager.name} is already assigned to ${existingAssignment.name}.`);
        error.statusCode = 400;
        throw error;
    }

    return manager._id;
};

const getWarehouses = async (req, res) => {
    try {
        const warehouses = await Warehouse.find({})
            .populate('manager', 'name email role')
            .sort({ name: 1 });
        res.status(200).json(warehouses);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const createWarehouse = async (req, res) => {
    try {
        if (!requireSuperAdmin(req, res)) return;
        const { name, address, manager } = req.body;
        if (!name) {
            return res.status(400).json({ message: 'Warehouse name is required.' });
        }
        const assignedManager = await resolveManagerAssignment(manager);
        const warehouse = await Warehouse.create({
            name: name.trim(),
            address: address || '',
            manager: assignedManager,
        });
        await warehouse.populate('manager', 'name email role');
        res.status(201).json(warehouse);
    } catch (error) {
        res.status(error.statusCode || 500).json({ message: error.message });
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
        warehouse.manager = await resolveManagerAssignment(req.body.manager, warehouse._id);
        await warehouse.save();
        await warehouse.populate('manager', 'name email role');

        res.status(200).json(warehouse);
    } catch (error) {
        res.status(error.statusCode || 500).json({ message: error.message });
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
