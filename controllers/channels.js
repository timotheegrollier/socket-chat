const Channel = require('../models/chatChannel')
const Message = require('../models/chatMessage')

const DEFAULT_CHANNEL = 'general'
const CHANNEL_PATTERN = /^[a-z0-9][a-z0-9-]{0,23}$/

const normalizeChannel = (value) => {
    if (typeof value !== 'string') return ''
    return value.trim().toLowerCase().replace(/^#/, '')
}

exports.getChannels = (req, res) => {
    Channel.find()
        .sort({ createdAt: 1 })
        .then((channels) => {
            const list = channels.map((channel) => ({
                name: channel.name,
                createdAt: channel.createdAt,
            }))
            if (!list.some((channel) => channel.name === DEFAULT_CHANNEL)) {
                list.unshift({ name: DEFAULT_CHANNEL, createdAt: null })
            }
            res.status(200).json({ channels: list })
        })
        .catch((error) => res.status(400).json({ error }))
}

exports.newChannel = (req, res) => {
    const name = normalizeChannel(req.body.name)
    if (!CHANNEL_PATTERN.test(name)) {
        return res.status(422).json({
            error: 'Channel names must be 1-24 characters: lowercase letters, numbers or hyphens.',
        })
    }
    if (name === DEFAULT_CHANNEL) {
        return res.status(409).json({ error: '#general already exists.' })
    }

    Channel.create({ name })
        .then((channel) => res.status(201).json({ channel }))
        .catch((error) => {
            if (error && error.code === 11000) {
                return res.status(409).json({ error: 'This channel already exists.' })
            }
            return res.status(400).json({ error })
        })
}

exports.deleteChannel = (req, res) => {
    const name = normalizeChannel(req.params.name)
    if (!CHANNEL_PATTERN.test(name)) {
        return res.status(422).json({ error: 'Invalid channel name.' })
    }
    if (name === DEFAULT_CHANNEL) {
        return res.status(400).json({ error: '#general cannot be deleted.' })
    }

    Channel.findOneAndDelete({ name })
        .then((channel) => {
            if (!channel) {
                return res.status(404).json({ error: 'Channel not found.' })
            }
            return Message.deleteMany({ channel: name }).then(() =>
                res.status(200).json({ name })
            )
        })
        .catch((error) => res.status(400).json({ error }))
}
