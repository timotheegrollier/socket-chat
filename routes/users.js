const express = require('express')
const router = express.Router()
const usersCtrl = require('../controllers/users')
const { check } = require('express-validator');


router.post('/signup', [check('pseudo').trim().isLength({ min: 4, max: 12 }).withMessage('Pseudo must be at least 4 characters and 12 max'), check('password').isLength({ min: 4, max: 20 }).withMessage('Password be at least 4 characters')], usersCtrl.signup)
router.post('/login', usersCtrl.login)
router.get('/',usersCtrl.getAll)
router.get('/:id',usersCtrl.getUserName)
router.delete('/reset',usersCtrl.deleteAll)

module.exports = router;