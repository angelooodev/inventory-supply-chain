const User = require('../models/userModel');

const SUPER_ADMIN = {
    name: 'Earl Super Admin',
    email: 'earljustinesierra@gmail.com',
    password: 'Earl123',
    role: 'SuperAdmin',
};

const ensureSuperAdmin = async () => {
    const existingUser = await User.findOne({ email: SUPER_ADMIN.email });

    if (existingUser) {
        let changed = false;

        if (existingUser.name !== SUPER_ADMIN.name) {
            existingUser.name = SUPER_ADMIN.name;
            changed = true;
        }

        if (existingUser.role !== SUPER_ADMIN.role) {
            existingUser.role = SUPER_ADMIN.role;
            changed = true;
        }

        if (changed) {
            await existingUser.save();
            console.log('Super Admin account updated.');
        }

        return;
    }

    await User.create(SUPER_ADMIN);
    console.log('Super Admin account created.');
};

module.exports = ensureSuperAdmin;
