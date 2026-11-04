const mongoose = require('mongoose')

const chatMessageSchema = mongoose.Schema({
    message: { type: String, required: true, trim: true, minLength: 1, maxLength: 500 },
    author: { type: String, trim: true, maxLength: 12 },
    authorId: { type: String, trim: true, maxLength: 64 },
    createdAt: { type: Date, default: Date.now },
})

module.exports = mongoose.model('chatMessage', chatMessageSchema)
