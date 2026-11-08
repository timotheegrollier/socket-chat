const mongoose = require('mongoose')

const chatMessageSchema = mongoose.Schema({
    message: { type: String, trim: true, maxLength: 500, default: '' },
    imageUrl: { type: String, trim: true },
    author: { type: String, trim: true, maxLength: 12 },
    authorId: { type: String, trim: true, maxLength: 64 },
    channel: { type: String, trim: true, maxLength: 24, default: 'general', index: true },
    createdAt: { type: Date, default: Date.now },
})

module.exports = mongoose.model('chatMessage', chatMessageSchema)
