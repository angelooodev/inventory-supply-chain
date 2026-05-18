const Supplier = require('../models/supplierModel');
const User = require('../models/userModel');

const requireSuperAdmin = (req, res) => {
    if (!req.user || req.user.role !== 'SuperAdmin') {
        res.status(403).json({ message: 'Access Denied: Only the Super Admin can manage suppliers.' });
        return false;
    }
    return true;
};

const buildPaymentMethodName = (methodType, providerCode, fallbackName = '') => {
    const normalizedType = String(methodType || '').trim().toLowerCase();
    const normalizedProvider = String(providerCode || '').trim();
    if (fallbackName) return fallbackName;

    if (normalizedType === 'ewallet') {
        if (normalizedProvider === 'GCASH') return 'GCash';
        if (normalizedProvider === 'MAYA') return 'Maya';
        return normalizedProvider || 'E-Wallet';
    }

    return normalizedProvider || 'Bank Account';
};

const normalizePaymentMethods = (paymentMethods) => {
    if (!Array.isArray(paymentMethods)) return [];

    const normalizedMethods = paymentMethods
        .map((entry) => ({
            methodType: String(entry?.methodType || 'bank_account').trim().toLowerCase() === 'ewallet' ? 'ewallet' : 'bank_account',
            providerCode: String(entry?.providerCode || '').trim().toUpperCase(),
            methodName: buildPaymentMethodName(
                entry?.methodType,
                String(entry?.providerCode || '').trim().toUpperCase(),
                String(entry?.methodName || '').trim()
            ),
            accountName: String(entry?.accountName || '').trim(),
            accountNumber: String(entry?.accountNumber || '').trim(),
            notes: String(entry?.notes || '').trim(),
            isPrimary: Boolean(entry?.isPrimary),
        }))
        .filter((entry) => entry.providerCode && entry.accountName && entry.accountNumber);

    if (!normalizedMethods.length) return [];

    const primaryIndex = normalizedMethods.findIndex((entry) => entry.isPrimary);
    const resolvedPrimaryIndex = primaryIndex >= 0 ? primaryIndex : 0;

    return normalizedMethods.map((entry, index) => ({
        ...entry,
        isPrimary: index === resolvedPrimaryIndex,
    }));
};

const syncSupplierAccount = async (supplier, password, createdBy) => {
    const normalizedPassword = String(password || '').trim();
    const accountName = supplier.contactPerson?.trim() || supplier.name;
    const accountEmail = supplier.email.trim();

    let supplierUser = supplier.accountUser
        ? await User.findById(supplier.accountUser)
        : await User.findOne({ supplier: supplier._id });

    if (!supplierUser) {
        if (!normalizedPassword || normalizedPassword.length < 6) {
            throw new Error('Supplier password must be at least 6 characters long.');
        }

        const existingUser = await User.findOne({ email: accountEmail });
        if (existingUser) {
            throw new Error('Supplier email is already used by another account.');
        }

        supplierUser = await User.create({
            name: accountName,
            email: accountEmail,
            password: normalizedPassword,
            role: 'Supplier',
            supplier: supplier._id,
            createdBy,
        });
    } else {
        const existingUser = await User.findOne({ email: accountEmail, _id: { $ne: supplierUser._id } });
        if (existingUser) {
            throw new Error('Supplier email is already used by another account.');
        }

        supplierUser.name = accountName;
        supplierUser.email = accountEmail;
        supplierUser.role = 'Supplier';
        supplierUser.supplier = supplier._id;
        if (normalizedPassword) {
            if (normalizedPassword.length < 6) {
                throw new Error('Supplier password must be at least 6 characters long.');
            }
            supplierUser.password = normalizedPassword;
        }
        await supplierUser.save();
    }

    supplier.accountUser = supplierUser._id;
    await supplier.save();
};

// @desc    Get all suppliers
// @route   GET /api/suppliers
const getSuppliers = async (req, res) => {
    try {
        const suppliers = await Supplier.find().populate('accountUser', 'name email role');
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
        const { password, ...supplierData } = req.body;
        if (!password || String(password).trim().length < 6) {
            return res.status(400).json({ message: 'Supplier password must be at least 6 characters long.' });
        }

        const supplier = await Supplier.create(supplierData);
        await syncSupplierAccount(supplier, password, req.user._id);
        const populatedSupplier = await Supplier.findById(supplier._id).populate('accountUser', 'name email role');
        res.status(201).json(populatedSupplier);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const updateSupplier = async (req, res) => {
    try {
        if (!requireSuperAdmin(req, res)) return;

        const supplier = await Supplier.findById(req.params.id);
        if (!supplier) {
            return res.status(404).json({ message: 'Supplier not found' });
        }

        const nextEmail = req.body.email?.trim();
        if (nextEmail && nextEmail !== supplier.email && supplier.accountUser) {
            const existingUser = await User.findOne({ email: nextEmail, _id: { $ne: supplier.accountUser } });
            if (existingUser) {
                return res.status(400).json({ message: 'Email is already in use by another account.' });
            }
        }

        const { password, ...supplierData } = req.body;
        const updatedSupplier = await Supplier.findByIdAndUpdate(req.params.id, supplierData, { new: true, runValidators: true });
        await syncSupplierAccount(updatedSupplier, password, req.user._id);

        const populatedSupplier = await Supplier.findById(updatedSupplier._id).populate('accountUser', 'name email role');
        res.status(200).json(populatedSupplier);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const deleteSupplier = async (req, res) => {
    try {
        if (!requireSuperAdmin(req, res)) return;

        const supplier = await Supplier.findById(req.params.id);
        if (!supplier) {
            return res.status(404).json({ message: 'Supplier not found' });
        }

        if (supplier.accountUser) {
            await User.findByIdAndDelete(supplier.accountUser);
        }

        await supplier.deleteOne();
        res.status(200).json({ message: 'Supplier deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const createOrUpdateSupplierAccount = async (req, res) => {
    try {
        if (!requireSuperAdmin(req, res)) return;

        const supplier = await Supplier.findById(req.params.id);
        if (!supplier) {
            return res.status(404).json({ message: 'Supplier not found.' });
        }

        const { password } = req.body;
        await syncSupplierAccount(supplier, password, req.user._id);

        const populatedSupplier = await Supplier.findById(supplier._id).populate('accountUser', 'name email role');
        res.status(200).json(populatedSupplier);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const getOwnSupplierProfile = async (req, res) => {
    try {
        if (!req.user || req.user.role !== 'Supplier' || !req.user.supplier) {
            return res.status(403).json({ message: 'Access Denied: Supplier account required.' });
        }

        const supplier = await Supplier.findById(req.user.supplier).populate('accountUser', 'name email role');
        if (!supplier) {
            return res.status(404).json({ message: 'Supplier profile not found.' });
        }

        res.status(200).json(supplier);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateOwnPaymentMethods = async (req, res) => {
    try {
        if (!req.user || req.user.role !== 'Supplier' || !req.user.supplier) {
            return res.status(403).json({ message: 'Access Denied: Supplier account required.' });
        }

        const supplier = await Supplier.findById(req.user.supplier);
        if (!supplier) {
            return res.status(404).json({ message: 'Supplier profile not found.' });
        }

        supplier.paymentMethods = normalizePaymentMethods(req.body.paymentMethods);
        await supplier.save();

        const populatedSupplier = await Supplier.findById(supplier._id).populate('accountUser', 'name email role');
        res.status(200).json(populatedSupplier);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getSuppliers,
    createSupplier,
    updateSupplier,
    deleteSupplier,
    createOrUpdateSupplierAccount,
    getOwnSupplierProfile,
    updateOwnPaymentMethods,
};
