const Message = require('../models/chatMessage')
const User = require('../models/tchatUser')

const DEFAULT_CHANNEL = 'general'
const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i
const CHANNEL_PATTERN = /^[a-z0-9][a-z0-9-]{0,23}$/

const normalizeChannel = (value) => {
    if (typeof value !== 'string') return DEFAULT_CHANNEL
    const name = value.trim().toLowerCase().replace(/^#/, '')
    return CHANNEL_PATTERN.test(name) ? name : DEFAULT_CHANNEL
}

const channelFilter = (channel) => {
    if (channel === DEFAULT_CHANNEL) {
        // Messages sent before channels existed have no channel field.
        return { $or: [{ channel: DEFAULT_CHANNEL }, { channel: { $exists: false } }] }
    }
    return { channel }
}

exports.newMessage = (req, res, next) => {
    const message = typeof req.body.message === 'string' ? req.body.message.trim().slice(0, 500) : ''
    // Support both multipart upload (req.file via multer) and JSON payload with imageUrl
    const imageUrl = req.file
        ? '/images/' + req.file.filename
        : (typeof req.body.imageUrl === 'string' ? req.body.imageUrl : '')

    // A message must carry text and/or an image.
    if (!message && !imageUrl) {
        return res.status(400).json({ error: 'Message vide !' })
    }

    const author = typeof req.body.author === 'string' ? req.body.author.trim().slice(0, 12) : ''
    const authorId = typeof req.body.authorId === 'string' ? req.body.authorId.trim().slice(0, 64) : ''
    const channel = normalizeChannel(req.body.channel)

    // The stored pseudo is authoritative: the client may still be loading the
    // profile, and old clients may send "Anonymous". Resolve the author from
    // the user id whenever it points to a real account.
    const resolveAuthor = () => {
        if (!authorId || !OBJECT_ID_PATTERN.test(authorId)) {
            return Promise.resolve(author || 'Anonymous')
        }
        return User.findById(authorId)
            .then((user) => (user && user.pseudo ? user.pseudo : author || 'Anonymous'))
            .catch(() => author || 'Anonymous')
    }

    resolveAuthor()
        .then((resolvedAuthor) => {
            const newMessage = new Message({
                message,
                author: resolvedAuthor,
                authorId,
                channel,
                ...(imageUrl ? { imageUrl } : {}),
            })
            return newMessage.save()
        })
        .then((msg) => res.status(200).json({ msg }))
        .catch((err) => res.status(400).json({ err }))
}

exports.getMessages = (req, res, next) => {
    const channel = normalizeChannel(req.query.channel)
    Message.find(channelFilter(channel))
        .sort({ createdAt: 1 })
        .then(messages => res.status(200).json({ messages, channel }))
        .catch(error => res.status(400).json({ error }))
}

exports.deleteMessages = (req, res) => {
    const channel = normalizeChannel(req.query.channel || req.body.channel)
    Message.deleteMany(channelFilter(channel))
        .then(() => {
            res.status(200).json({ msg: "Tchat supprimé !", channel });
        })
        .catch((error) => res.status(400).json({ error }))
}

exports.deleteMessage = (req, res) => {
    const authorId = typeof req.body.authorId === 'string' ? req.body.authorId : '';

    Message.findById(req.params.id)
        .then((message) => {
            if (!message) {
                return res.status(404).json({ error: 'Message introuvable' });
            }
            if (message.authorId && message.authorId !== authorId) {
                return res.status(403).json({ error: 'Action non autorisée' });
            }
            return message.deleteOne()
                .then(() => res.status(200).json({ msg: 'Message supprimé !' }));
        })
        .catch((error) => res.status(400).json({ error }))
}
