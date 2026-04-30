const express = require('express');
const router = express.Router();
const { registerUser, authUser, getUsers } = require('../controllers/userController');

// Added the GET route to view users
router.route('/').post(registerUser).get(getUsers);
router.post('/login', authUser);

module.exports = router;