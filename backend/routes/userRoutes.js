const express = require('express');
const router = express.Router();
const { registerUser, authUser, getUsers, updateUser, deleteUser } = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

// Added the GET route to view users
router.route('/').post(protect, registerUser).get(protect, getUsers);
router.route('/:id').put(protect, updateUser).delete(protect, deleteUser);
router.post('/login', authUser);

module.exports = router;
