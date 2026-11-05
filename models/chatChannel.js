const mongoose = require('mongoose')

const chatChannelSchema = mongoose.Schema({
    name: { type: String, required: true, unique: true, trim: true, minLength: 1, maxLength: 24 },
    createdAt: { type: Date, default: Date.now },
})

module.exports = mongoose.model('chatChannel', chatChannelSchema)
