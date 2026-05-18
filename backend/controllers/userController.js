const User = require('../models/userModel');
const jwt = require('jsonwebtoken');
const Supplier = require('../models/supplierModel');

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

const canManagerEditAssignedPersonnel = (actor, target) => {
    return actor.role === 'Manager'
        && ['Staff', 'Accountant'].includes(target.role)
        && target.createdBy?.toString() === actor._id.toString();
};

// @desc    Register a new user (Manager Only)
const registerUser = async (req, res) => {
    const { name, email, password, role } = req.body;
    const normalizedRole = role || 'Staff';

    const userExists = await User.findOne({ email });
    if (userExists) return res.status(400).json({ message: 'User already exists' });

    if (!req.user || !['Manager', 'SuperAdmin'].includes(req.user.role)) {
        return res.status(401).json({ message: 'Access Denied: Only Managers or Super Admins can register personnel.' });
    }

    if (normalizedRole === 'Manager' && req.user.role !== 'SuperAdmin') {
        return res.status(403).json({ message: 'Access Denied: Only the Super Admin can create manager accounts.' });
    }

    if (!['Manager', 'Accountant', 'Staff'].includes(normalizedRole)) {
        return res.status(400).json({ message: 'Invalid role selected.' });
    }

    const user = await User.create({ name, email, password, role: normalizedRole, createdBy: req.user._id });

    if (user) {
        res.status(201).json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            token: generateToken(user._id),
        });
    } else {
        res.status(400).json({ message: 'Invalid user data' });
    }
};

const authUser = async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).populate('supplier', 'name');

    if (user && (await user.matchPassword(password))) {
        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            supplierId: user.supplier?._id || null,
            supplierName: user.supplier?.name || '',
            token: generateToken(user._id),
        });
    } else {
        res.status(401).json({ message: 'Invalid email or password' });
    }
};

const getUsers = async (req, res) => {
    try {
        if (!req.user || !['Manager', 'SuperAdmin'].includes(req.user.role)) {
            return res.status(401).json({ message: 'Not authorized to view users.' });
        }
        const users = await User.find().select('-password').populate('createdBy', 'name email role');
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};

const updateUser = async (req, res) => {
    try {
        if (!req.user || !['Manager', 'SuperAdmin', 'Supplier', 'Accountant'].includes(req.user.role)) {
            return res.status(401).json({ message: 'Not authorized to edit users.' });
        }

        const targetUser = await User.findById(req.params.id);
        if (!targetUser) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const isSuperAdminEditing = req.user.role === 'SuperAdmin';
        const isSuperAdminEditingSelf = isSuperAdminEditing && targetUser._id.toString() === req.user._id.toString();
        const isManagerEditingSelf = req.user.role === 'Manager' && targetUser._id.toString() === req.user._id.toString();
        const isManagerEditingOwnStaff = canManagerEditAssignedPersonnel(req.user, targetUser);
        const isSupplierEditingSelf = req.user.role === 'Supplier' && targetUser._id.toString() === req.user._id.toString();
        const isAccountantEditingSelf = req.user.role === 'Accountant' && targetUser._id.toString() === req.user._id.toString();

        if (req.user.role === 'Supplier' && !isSupplierEditingSelf) {
            return res.status(403).json({ message: 'Access Denied: Suppliers can only edit their own account.' });
        }

        if (req.user.role === 'Accountant' && !isAccountantEditingSelf) {
            return res.status(403).json({ message: 'Access Denied: Accountants can only edit their own account.' });
        }

        if (targetUser.role === 'SuperAdmin' && !isSuperAdminEditingSelf) {
            return res.status(403).json({ message: 'Only the Super Admin can edit their own account.' });
        }

        if (!isSuperAdminEditing && !isManagerEditingSelf && !isManagerEditingOwnStaff && !isSupplierEditingSelf && !isAccountantEditingSelf) {
            return res.status(403).json({ message: 'Access Denied: You can only edit personnel accounts that you created.' });
        }

        if (req.user.role === 'Manager' && !isManagerEditingSelf && !['Staff', 'Accountant'].includes(targetUser.role)) {
            return res.status(403).json({ message: 'Access Denied: Managers can only edit staff or accountant accounts.' });
        }

        if (req.user.role === 'Supplier' && targetUser.role !== 'Supplier') {
            return res.status(403).json({ message: 'Access Denied: Suppliers can only edit supplier accounts.' });
        }

        if (req.user.role === 'Accountant' && targetUser.role !== 'Accountant') {
            return res.status(403).json({ message: 'Access Denied: Accountants can only edit accountant accounts.' });
        }

        const { name, email, password } = req.body;

        if (email && email !== targetUser.email) {
            const existing = await User.findOne({ email });
            if (existing && existing._id.toString() !== targetUser._id.toString()) {
                return res.status(400).json({ message: 'Email is already in use.' });
            }
            targetUser.email = email;
        }

        if (name) targetUser.name = name;
        if (password) targetUser.password = password;

        await targetUser.save();

        if (targetUser.role === 'Supplier' && targetUser.supplier) {
            const linkedSupplier = await Supplier.findById(targetUser.supplier);
            if (linkedSupplier) {
                if (name) {
                    linkedSupplier.contactPerson = name;
                }
                if (email && email !== linkedSupplier.email) {
                    linkedSupplier.email = email;
                }
                await linkedSupplier.save();
            }
        }

        const updatedUser = await User.findById(targetUser._id).select('-password').populate('createdBy', 'name email role');
        res.json(updatedUser);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};

const deleteUser = async (req, res) => {
    try {
        if (!req.user || req.user.role !== 'SuperAdmin') {
            return res.status(403).json({ message: 'Access Denied: Only the Super Admin can revoke accounts.' });
        }

        const targetUser = await User.findById(req.params.id);
        if (!targetUser) {
            return res.status(404).json({ message: 'User not found.' });
        }

        if (targetUser.role === 'SuperAdmin') {
            return res.status(403).json({ message: 'The Super Admin account cannot be revoked.' });
        }

        await targetUser.deleteOne();
        res.json({ message: 'User revoked successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};

module.exports = { registerUser, authUser, getUsers, updateUser, deleteUser };
