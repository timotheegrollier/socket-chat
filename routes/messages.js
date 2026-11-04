const express = require('express');
const router = express.Router()
const msgCtrl = require('../controllers/messages');

router.get('/',msgCtrl.getMessages)
router.post('/new',msgCtrl.newMessage)
router.delete('/',msgCtrl.deleteMessages)
router.delete('/:id',msgCtrl.deleteMessage)

module.exports = router;