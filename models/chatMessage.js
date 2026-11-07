const mongoose = require('mongoose')

const chatMessageSchema = mongoose.Schema({
    message: { type: String, required: true, trim: true, minLength: 1, maxLength: 500 },
    author: { type: String, trim: true, maxLength: 12 },
    authorId: { type: String, trim: true, maxLength: 64 },
    channel: { type: String, trim: true, maxLength: 24, default: 'general', index: true },
    createdAt: { type: Date, default: Date.now },
}, { versionKey: false })

// Optimise le chargement des messages par salon + tri chronologique
chatMessageSchema.index({ channel: 1, createdAt: 1 })
// Aide pour les anciens messages sans champ channel (fallback général)
chatMessageSchema.index({ createdAt: 1 })
// Index utile pour les suppressions/recherches récentes
chatMessageSchema.index({ authorId: 1, createdAt: -1 })

module.exports = mongoose.model('chatMessage', chatMessageSchema)
