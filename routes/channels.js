const express = require('express');
const router = express.Router()
const channelsCtrl = require('../controllers/channels');

router.get('/', channelsCtrl.getChannels)
router.post('/new', channelsCtrl.newChannel)
router.delete('/:name', channelsCtrl.deleteChannel)

module.exports = router;
