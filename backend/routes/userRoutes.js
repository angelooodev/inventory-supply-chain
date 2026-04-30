const express = require('express');
const router = express.Router();
const { registerUser, authUser } = require('../controllers/userController');

// Standard registration and login routes
router.post('/', registerUser);
router.post('/login', authUser);

module.exports = router;