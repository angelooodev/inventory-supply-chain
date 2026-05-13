const Supplier = require('../models/supplierModel');

const requireSuperAdmin = (req, res) => {
    if (!req.user || req.user.role !== 'SuperAdmin') {
        res.status(403).json({ message: 'Access Denied: Only the Super Admin can manage suppliers.' });
        return false;
    }
    return true;
};

// @desc    Get all suppliers
// @route   GET /api/suppliers
const getSuppliers = async (req, res) => {
    try {
        const suppliers = await Supplier.find();
        res.status(200).json(suppliers);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Create a supplier
// @route   POST /api/suppliers
const createSupplier = async (req, res) => {
    try {
        if (!requireSuperAdmin(req, res)) return;
        const supplier = await Supplier.create(req.body);
        res.status(201).json(supplier);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateSupplier = async (req, res) => {
    try {
        if (!requireSuperAdmin(req, res)) return;

        const supplier = await Supplier.findById(req.params.id);
        if (!supplier) {
            return res.status(404).json({ message: 'Supplier not found' });
        }

        const updatedSupplier = await Supplier.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        res.status(200).json(updatedSupplier);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const deleteSupplier = async (req, res) => {
    try {
        if (!requireSuperAdmin(req, res)) return;

        const supplier = await Supplier.findById(req.params.id);
        if (!supplier) {
            return res.status(404).json({ message: 'Supplier not found' });
        }

        await supplier.deleteOne();
        res.status(200).json({ message: 'Supplier deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { getSuppliers, createSupplier, updateSupplier, deleteSupplier };
