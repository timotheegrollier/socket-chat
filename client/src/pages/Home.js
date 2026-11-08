import React, { useEffect, useRef } from "react";
import Nav from '../components/Nav';
import socketIOClient from "socket.io-client";
import axios from "axios";
import { useStateIfMounted } from "use-state-if-mounted";
import Login from "../components/Login";
import { Link } from "react-router-dom";

const APP_VERSION = process.env.REACT_APP_VERSION || '2.2.8';
const USERNAME_KEY = 'socket-chat-username';
const EMOJIS = ['😀', '😂', '😍', '👍', '🔥', '🎉', '❤️', '🤔', '😅', '🙏', '🚀', '💯'];
const MAX_MESSAGE_LENGTH = 500;
const GROUP_WINDOW_MS = 5 * 60 * 1000;
const AVATAR_PALETTE = ['#5b7cfa', '#7a6ff0', '#4f9cf9', '#43b3a8', '#d7746b', '#c98a4b', '#8f7ec9', '#5fa06f'];
const RECONNECT_DELAY_MS = 500;
const RECONNECT_DELAY_MAX_MS = 5000;
// After a long screen lock / app switch, force a fresh socket instead of
// trusting a connection the OS may have silently frozen.
const RESUME_RECONNECT_MS = 15000;
const CONNECTION_LABELS = {
    connecting: 'Connecting',
    live: 'Live',
    reconnecting: 'Reconnecting',
    offline: 'Offline',
    paused: 'Paused',
};

const initials = (name) => (name || '?').trim().charAt(0).toUpperCase();

const avatarColor = (name) => {
    let hash = 0
    for (const c of String(name || '')) hash = (hash * 31 + c.charCodeAt(0)) % AVATAR_PALETTE.length
    return AVATAR_PALETTE[hash]
}

const formatTime = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const formatDay = (iso) => {
    if (!iso) return 'Earlier'
    const d = new Date(iso)
    if (isNaN(d.getTime())) return 'Earlier'
    const atMidnight = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
    const diff = Math.round((atMidnight(new Date()) - atMidnight(d)) / 86400000)
    if (diff === 0) return 'Today'
    if (diff === 1) return 'Yesterday'
    return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
}

const dayKey = (iso) => {
    if (!iso) return 'earlier'
    const d = new Date(iso)
    return isNaN(d.getTime()) ? 'earlier' : d.toDateString()
}

const sortChannels = (list) => [...list].sort((a, b) => {
    if (a.name === 'general') return -1
    if (b.name === 'general') return 1
    return new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
})

const CHANNEL_PATTERN = /^[a-z0-9][a-z0-9-]{0,23}$/
// Keep the last conversation on the device so a cold PWA start renders it
// immediately instead of waiting for the REST API (often a sleeping free
// host). The cache is versioned and scoped per account, and is always
// revalidated in the background.
const CHAT_CACHE_VERSION = 1
const CHAT_CACHE_PREFIX = 'socket-chat-cache-v' + CHAT_CACHE_VERSION + ':'
const MAX_CACHED_MESSAGES = 150
const MAX_CACHED_CHANNELS = 24

const currentUserId = () => {
    try {
        const auth = JSON.parse(localStorage.getItem('JWT'))
        return auth && auth.userId ? auth.userId : null
    } catch (error) {
        return null
    }
}

const normalizeCachedMessage = (message, fallbackChannel) => {
    if (!message || typeof message !== 'object') return null
    if (!message._id || typeof message.message !== 'string') return null
    return {
        _id: String(message._id),
        message: message.message,
        author: typeof message.author === 'string' && message.author ? message.author : 'Anonymous',
        authorId: typeof message.authorId === 'string' ? message.authorId : '',
        channel: typeof message.channel === 'string' && message.channel ? message.channel : fallbackChannel,
        createdAt: message.createdAt || null,
    }
}

const readChatCache = (userId) => {
    if (!userId) return null
    try {
        const raw = localStorage.getItem(CHAT_CACHE_PREFIX + userId)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        if (!parsed || parsed.v !== CHAT_CACHE_VERSION) return null
        const channels = Array.isArray(parsed.channels)
            ? parsed.channels.filter((channel) => channel && typeof channel.name === 'string')
            : []
        const messages = {}
        if (parsed.messages && typeof parsed.messages === 'object') {
            Object.keys(parsed.messages).forEach((channel) => {
                const list = parsed.messages[channel]
                if (!Array.isArray(list)) return
                const clean = list
                    .map((message) => normalizeCachedMessage(message, channel))
                    .filter(Boolean)
                    .slice(-MAX_CACHED_MESSAGES)
                if (clean.length) messages[channel] = clean
            })
        }
        return { channels, messages }
    } catch (error) {
        return null
    }
}

const updateChatCache = (userId, mutate) => {
    if (!userId) return
    try {
        const cache = readChatCache(userId) || { channels: [], messages: {} }
        mutate(cache)
        const channels = cache.channels.slice(0, MAX_CACHED_CHANNELS)
        const names = new Set(channels.map((channel) => channel.name))
        const messages = {}
        Object.keys(cache.messages || {}).forEach((channel) => {
            // Once the channel list is known, drop history for removed
            // channels instead of keeping it forever in localStorage.
            if (names.size && !names.has(channel)) return
            const list = (cache.messages[channel] || [])
                .filter((message) => message && !message.pending)
                .map((message) => normalizeCachedMessage(message, channel))
                .filter(Boolean)
                .slice(-MAX_CACHED_MESSAGES)
            if (list.length) messages[channel] = list
        })
        localStorage.setItem(CHAT_CACHE_PREFIX + userId, JSON.stringify({
            v: CHAT_CACHE_VERSION,
            savedAt: Date.now(),
            channels,
            messages,
        }))
    } catch (error) {
        // Storage can be full or disabled (private mode): the chat still works.
    }
}

const IconSearch = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
)

const IconMenu = () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
    </svg>
)

const IconSend = () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
)

const IconCopy = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
)

const IconTrash = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
)

const IconLogout = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
    </svg>
)

const Home = () => {
    const [msg, setMsg] = useStateIfMounted([])
    const [sending, setSending] = useStateIfMounted(false)
    const [userCount, setUserCount] = useStateIfMounted()
    const [socketReady, setSocketReady] = useStateIfMounted(false)
    const [socketId, setSocketId] = useStateIfMounted(null)
    const [connectionState, setConnectionState] = useStateIfMounted('connecting')
    const [reconnectAttempt, setReconnectAttempt] = useStateIfMounted(0)
    const [onlineUsers, setOnlineUsers] = useStateIfMounted([])
    const [user, setUser] = useStateIfMounted()
    const [connected, setConnected] = useStateIfMounted(false)
    const [typingName, setTypingName] = useStateIfMounted('')
    const [unread, setUnread] = useStateIfMounted(0)
    const [showEmoji, setShowEmoji] = useStateIfMounted(false)
    const [charCount, setCharCount] = useStateIfMounted(0)
    const [newBelow, setNewBelow] = useStateIfMounted(false)
    const [messagesStatus, setMessagesStatus] = useStateIfMounted('loading')
    const [channelsStatus, setChannelsStatus] = useStateIfMounted('loading')
    const [slowBoot, setSlowBoot] = useStateIfMounted(false)
    const [slowConnection, setSlowConnection] = useStateIfMounted(false)
    const [searchOpen, setSearchOpen] = useStateIfMounted(false)
    const [searchTerm, setSearchTerm] = useStateIfMounted('')
    const [sidebarOpen, setSidebarOpen] = useStateIfMounted(false)
    const [showClearDialog, setShowClearDialog] = useStateIfMounted(false)
    const [toasts, setToasts] = useStateIfMounted([])
    const [channels, setChannels] = useStateIfMounted([{ name: 'general', createdAt: null }])
    const [activeChannel, setActiveChannel] = useStateIfMounted(localStorage.getItem('socket-chat-channel') || 'general')
    const [creatingChannel, setCreatingChannel] = useStateIfMounted(false)
    const [newChannelName, setNewChannelName] = useStateIfMounted('')

    const socketRef = useRef()
    const inputRef = useRef()
    const tchatRef = useRef()
    const typingTimerRef = useRef()
    const emojiRef = useRef()
    const emojiBtnRef = useRef()
    const channelInputRef = useRef()
    const activeChannelRef = useRef(activeChannel)
    const messagesRequestRef = useRef(0)
    const channelsRequestRef = useRef()
    const messagesRequestsRef = useRef({})
    const userRef = useRef()
    const profileLoadingRef = useRef(false)
    const syncTimerRef = useRef()
    const reconnectGuardRef = useRef(0)
    const everConnectedRef = useRef(false)
    const initialConnectFailedRef = useRef(false)
    const disconnectedAtRef = useRef(0)
    const hiddenAtRef = useRef(0)
    const messagesStatusRef = useRef('loading')
    const channelsStatusRef = useRef('loading')
    const retryLoadsRef = useRef()

    const config = require('../config.json')
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const myUserId = localStorage.getItem('JWT') ? JSON.parse(localStorage.getItem('JWT')).userId : null;

    const cacheChannels = (list) => {
        updateChatCache(currentUserId(), (cache) => {
            cache.channels = Array.isArray(list) ? list : []
        })
    }

    const cacheMessages = (channel, messages) => {
        updateChatCache(currentUserId(), (cache) => {
            cache.messages[channel] = Array.isArray(messages) ? messages : []
        })
    }

    const appendCachedMessage = (channel, message) => {
        if (!channel || !message || !message._id) return
        updateChatCache(currentUserId(), (cache) => {
            const list = cache.messages[channel] || []
            if (!list.some((item) => item._id === message._id)) list.push(message)
            cache.messages[channel] = list
        })
    }

    const removeCachedMessage = (channel, id) => {
        updateChatCache(currentUserId(), (cache) => {
            cache.messages[channel] = (cache.messages[channel] || [])
                .filter((message) => message._id !== id)
        })
    }

    const clearCachedMessages = (channel) => {
        if (!channel) return
        updateChatCache(currentUserId(), (cache) => {
            delete cache.messages[channel]
        })
    }

    const scrollToBottomSoon = () => requestAnimationFrame(() => {
        const el = tchatRef.current
        if (el) el.scrollTop = el.scrollHeight - el.clientHeight
    })

    useEffect(() => {
        if (localStorage.getItem('JWT') && JSON.parse(localStorage.getItem('JWT')).expiry > new Date().getTime()) {
            getLogged(true)
        } else {
            setConnected(false)
            localStorage.removeItem("JWT")
            localStorage.removeItem(USERNAME_KEY)
        }

        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }
            clearTimeout(typingTimerRef.current)
            clearTimeout(syncTimerRef.current)
        };
        // eslint-disable-next-line
    }, []);

    useEffect(() => {
        document.title = unread
            ? `(${unread}) new message${unread > 1 ? 's' : ''} — Socket Chat`
            : 'Socket Chat'
    }, [unread]);

    useEffect(() => {
        activeChannelRef.current = activeChannel
        localStorage.setItem('socket-chat-channel', activeChannel)
    }, [activeChannel]);

    useEffect(() => {
        if (creatingChannel && channelInputRef.current) channelInputRef.current.focus()
    }, [creatingChannel]);

    useEffect(() => {
        userRef.current = user
    }, [user]);

    useEffect(() => {
        channelsStatusRef.current = channelsStatus
    }, [channelsStatus]);

    useEffect(() => {
        messagesStatusRef.current = messagesStatus
    }, [messagesStatus]);

    // A cold PWA start can spend a while talking to a sleeping free-host API.
    // After 7s, tell the user what is happening instead of leaving a spinner.
    useEffect(() => {
        if (!connected || messagesStatus !== 'loading') {
            setSlowBoot(false)
            return
        }
        const timer = setTimeout(() => setSlowBoot(true), 7000)
        return () => clearTimeout(timer)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connected, messagesStatus]);

    // Same idea for the socket: don't flash a banner for a quick connection,
    // but surface it if the realtime server is still not there after 2.5s.
    useEffect(() => {
        if (!connected || connectionState === 'live' || connectionState === 'offline') {
            setSlowConnection(false)
            return
        }
        const timer = setTimeout(() => setSlowConnection(true), 2500)
        return () => clearTimeout(timer)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connected, connectionState]);

    useEffect(() => {
        const onVisibilityChange = () => {
            if (document.hidden) {
                hiddenAtRef.current = Date.now()
                stopTyping()
                setConnectionState((current) => {
                    if (typeof navigator !== 'undefined' && !navigator.onLine) return 'offline'
                    return current === 'live' ? 'paused' : current
                })
                return
            }
            setUnread(0)
            resumeRealtime()
        }

        const onOnline = () => {
            if (!document.hidden) reconnectNow()
        }

        const onOffline = () => {
            setTypingName('')
            setConnectionState('offline')
        }

        const onFocus = () => {
            if (!document.hidden) resumeRealtime()
        }

        const onPageShow = () => {
            if (!document.hidden) resumeRealtime()
        }

        document.addEventListener('visibilitychange', onVisibilityChange)
        window.addEventListener('online', onOnline)
        window.addEventListener('offline', onOffline)
        window.addEventListener('focus', onFocus)
        window.addEventListener('pageshow', onPageShow)
        return () => {
            document.removeEventListener('visibilitychange', onVisibilityChange)
            window.removeEventListener('online', onOnline)
            window.removeEventListener('offline', onOffline)
            window.removeEventListener('focus', onFocus)
            window.removeEventListener('pageshow', onPageShow)
        }
        // eslint-disable-next-line
    }, []);

    useEffect(() => {
        if (socketReady && socketRef.current && user && user.username) {
            socketRef.current.emit('join', user.username)
        }
    }, [socketReady, user]);

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') {
                setShowEmoji(false)
                setSearchOpen(false)
                setSearchTerm('')
                setSidebarOpen(false)
                setShowClearDialog(false)
            }
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!showEmoji) return
        const onDown = (e) => {
            if (emojiRef.current && emojiRef.current.contains(e.target)) return
            if (emojiBtnRef.current && emojiBtnRef.current.contains(e.target)) return
            setShowEmoji(false)
        }
        document.addEventListener('mousedown', onDown)
        return () => document.removeEventListener('mousedown', onDown)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showEmoji]);

    const pushToast = (message, type = 'info') => {
        const id = Date.now() + Math.random()
        setToasts((current) => [...current, { id, message, type }])
        setTimeout(() => {
            setToasts((current) => current.filter((toast) => toast.id !== id))
        }, 4000)
    }

    const setupSocket = () => {
        if (socketRef.current) return

        const socket = socketIOClient(config.socket_url, {
            transports: ['websocket'],
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: RECONNECT_DELAY_MS,
            reconnectionDelayMax: RECONNECT_DELAY_MAX_MS,
            randomizationFactor: 0.4,
            timeout: 12000,
        })
        socketRef.current = socket

        socket.io.on('reconnect_attempt', (attempt) => {
            setReconnectAttempt(attempt)
            if (!document.hidden && (typeof navigator === 'undefined' || navigator.onLine)) {
                setConnectionState('reconnecting')
            }
        })
        socket.io.on('reconnect_error', () => {
            if (!document.hidden && (typeof navigator === 'undefined' || navigator.onLine)) {
                setConnectionState('reconnecting')
            }
        })

        socket.on("connect", () => {
            const wasConnected = everConnectedRef.current
            const outage = wasConnected && disconnectedAtRef.current &&
                Date.now() - disconnectedAtRef.current > 1500
            everConnectedRef.current = true
            initialConnectFailedRef.current = false
            disconnectedAtRef.current = 0
            setSocketReady(true)
            setSocketId(socket.id)
            setConnectionState('live')
            setReconnectAttempt(0)
            if (wasConnected) {
                scheduleSync(150)
                if (outage && !document.hidden) {
                    pushToast('Back online — syncing messages…', 'success')
                }
            } else if (channelsStatusRef.current !== 'ready' || messagesStatusRef.current !== 'ready') {
                // The first connection can land after the initial REST calls
                // already failed (sleeping free-host API): reload them now.
                scheduleSync(150)
            }
        })
        socket.on("disconnect", (reason) => {
            setSocketReady(false)
            setTypingName('')
            if (!disconnectedAtRef.current) disconnectedAtRef.current = Date.now()
            if (reason === 'io client disconnect') return
            if (typeof navigator !== 'undefined' && !navigator.onLine) {
                setConnectionState('offline')
                return
            }
            if (document.hidden) {
                setConnectionState('paused')
                return
            }
            setConnectionState('reconnecting')
            if (reason === 'io server disconnect') {
                socket.connect()
            }
        })
        socket.on("connect_error", () => {
            initialConnectFailedRef.current = true
            setSocketReady(false)
            if (typeof navigator !== 'undefined' && !navigator.onLine) {
                setConnectionState('offline')
            } else if (document.hidden) {
                setConnectionState('paused')
            } else {
                setConnectionState('reconnecting')
            }
        })

        socket.on("newMsg", (data) => {
            const channel = data && data.channel
            const incoming = normalizeCachedMessage(data && data.message, channel || 'general')
            if (incoming) {
                // The sender already saved the message through the REST API;
                // the socket payload is enough to update every client without
                // an extra GET per message.
                appendCachedMessage(incoming.channel || channel, incoming)
                if (channel && channel !== activeChannelRef.current) return
                if (incoming.channel && incoming.channel !== activeChannelRef.current) return
                if (document.hidden) setUnread((current) => (current || 0) + 1)
                const list = tchatRef.current
                const nearBottom = !list || (list.scrollHeight - list.scrollTop - list.clientHeight < 150)
                setMsg((current) => {
                    const messages = current || []
                    if (messages.some((message) => message._id === incoming._id)) return messages
                    return [...messages, incoming]
                })
                setMessagesStatus('ready')
                if (nearBottom) scrollToBottomSoon()
                else setNewBelow(true)
                return
            }
            // Older payloads (or events such as a deletion) only carry the
            // channel: fall back to a full refresh.
            if (channel && channel !== activeChannelRef.current) return
            if (document.hidden) setUnread((current) => (current || 0) + 1)
            fetchMessages(activeChannelRef.current)
        })
        socket.on("reset", (data) => {
            const channel = data && data.channel
            if (channel) clearCachedMessages(channel)
            if (channel && channel !== activeChannelRef.current) return
            setMsg([])
            fetchMessages(activeChannelRef.current)
        })
        socket.on("channelsChanged", () => {
            refreshChannels()
        })
        socket.on("channelDeleted", (data) => {
            const channel = data && data.channel
            if (channel) clearCachedMessages(channel)
            if (channel && channel === activeChannelRef.current) changeChannel('general')
            refreshChannels()
        })
        socket.on('count', (count) => {
            setUserCount(count)
        })
        socket.on('presence', (users) => {
            setOnlineUsers(Array.isArray(users) ? users : [])
        })
        socket.on("typing", (data) => {
            const channel = data && data.channel
            if (channel && channel !== activeChannelRef.current) return
            const name = data && typeof data.name === 'string' ? data.name : ''
            setTypingName(name.trim().slice(0, 12))
        })
        socket.on("stopTyping", (data) => {
            const channel = data && data.channel
            if (channel && channel !== activeChannelRef.current) return
            setTypingName('')
        })
    }

    const getLogged = async (isConnected) => {
        setupSocket()
        setConnected(isConnected)
        loadProfile()

        // Paint the last known conversation immediately, then revalidate.
        const cache = readChatCache(currentUserId())
        const cachedChannels = cache && cache.channels.length ? sortChannels(cache.channels) : null
        let channel = activeChannelRef.current || 'general'
        if (cachedChannels && !cachedChannels.some((item) => item.name === channel)) {
            channel = 'general'
        }
        const cachedMessages = cache && cache.messages[channel]
        const hasCachedMessages = Boolean(cachedMessages && cachedMessages.length)

        if (cachedChannels) {
            setChannels(cachedChannels)
            setChannelsStatus('ready')
        } else {
            setChannelsStatus('loading')
        }
        activeChannelRef.current = channel
        setActiveChannel(channel)
        localStorage.setItem('socket-chat-channel', channel)
        if (hasCachedMessages) {
            setMsg(cachedMessages)
            setMessagesStatus('ready')
            scrollToBottomSoon()
        } else {
            setMessagesStatus('loading')
        }

        // Channels and messages are independent: load them in parallel so the
        // first screen does not wait for two cold API round-trips.
        const channelsPromise = fetchChannels()
        fetchMessages(channel, true, hasCachedMessages)
        const list = await channelsPromise
        if (list && !list.some((item) => item.name === channel)) {
            changeChannel('general')
        }
    }

    const applyProfile = (username) => {
        const clean = (username || '').trim().slice(0, 12)
        if (!clean) return false
        let auth = null
        try {
            auth = JSON.parse(localStorage.getItem('JWT'))
        } catch (error) {
            auth = null
        }
        const profile = {
            userId: auth ? auth.userId : null,
            JWT: auth ? auth.token : null,
            username: clean
        }
        localStorage.setItem(USERNAME_KEY, clean)
        userRef.current = profile
        setUser(profile)
        return true
    }

    const getUsername = async () => {
        try {
            const auth = JSON.parse(localStorage.getItem('JWT'))
            const res = await axios.get(config.api_url + '/api/secure/' + auth.userId)
            return res.data && res.data.user && typeof res.data.user.pseudo === 'string'
                ? res.data.user.pseudo
                : ''
        } catch (error) {
            // Offline or transient API failure: keep the cached pseudo.
            return ''
        }
    }

    const loadProfile = async () => {
        const cached = localStorage.getItem(USERNAME_KEY) || ''
        if (cached) applyProfile(cached)
        if (profileLoadingRef.current) return cached
        profileLoadingRef.current = true
        try {
            const username = await getUsername()
            if (username) applyProfile(username)
            return username || cached
        } finally {
            profileLoadingRef.current = false
        }
    }

    const fetchChannels = (silent = false) => {
        if (channelsRequestRef.current) return channelsRequestRef.current
        if (!silent) setChannelsStatus((current) => (current === 'ready' ? current : 'loading'))
        const request = (async () => {
            try {
                const res = await axios.get(config.api_url + '/api/channels')
                const list = Array.isArray(res.data.channels) ? res.data.channels : []
                if (!list.some((channel) => channel.name === 'general')) {
                    list.unshift({ name: 'general', createdAt: null })
                }
                const sorted = sortChannels(list)
                setChannels(sorted)
                setChannelsStatus('ready')
                cacheChannels(sorted)
                return sorted
            } catch (error) {
                // Keep the channels already on screen during a network blip;
                // only seed #general when nothing has loaded yet.
                setChannels((current) => (current && current.length)
                    ? current
                    : [{ name: 'general', createdAt: null }])
                setChannelsStatus((current) => (current === 'ready' ? current : 'error'))
                return null
            }
        })()
        channelsRequestRef.current = request
        request.finally(() => {
            if (channelsRequestRef.current === request) channelsRequestRef.current = undefined
        })
        return request
    }

    const refreshChannels = async () => {
        const list = await fetchChannels()
        if (list && !list.some((channel) => channel.name === activeChannelRef.current)) {
            changeChannel('general')
        }
    }

    const changeChannel = (name) => {
        const target = name || 'general'
        if (target === activeChannelRef.current) {
            setSidebarOpen(false)
            return
        }
        stopTyping()
        clearInput()
        activeChannelRef.current = target
        setActiveChannel(target)
        localStorage.setItem('socket-chat-channel', target)
        const cache = readChatCache(currentUserId())
        const cachedMessages = cache && cache.messages[target]
        const hasCachedMessages = Boolean(cachedMessages && cachedMessages.length)
        setMsg(hasCachedMessages ? cachedMessages : [])
        setMessagesStatus(hasCachedMessages ? 'ready' : 'loading')
        setNewBelow(false)
        setTypingName('')
        setSearchOpen(false)
        setSearchTerm('')
        if (hasCachedMessages) scrollToBottomSoon()
        fetchMessages(target, true, hasCachedMessages)
        setSidebarOpen(false)
        if (!isMobile && inputRef.current) inputRef.current.focus()
    }

    const fetchMessages = (channel = activeChannelRef.current, forceBottom = false, silent = false) => {
        const target = channel || 'general'
        const inFlight = messagesRequestsRef.current[target]
        if (inFlight && inFlight.requestId === messagesRequestRef.current) {
            return inFlight.promise
        }
        const requestId = ++messagesRequestRef.current
        const list = tchatRef.current
        const nearBottom = forceBottom || !list || (list.scrollHeight - list.scrollTop - list.clientHeight < 150)
        if (!silent) setMessagesStatus((current) => (current === 'ready' ? current : 'loading'))
        const request = (async () => {
            try {
                const res = await axios.get(config.api_url + '/api/messages', { params: { channel: target } })
                if (requestId !== messagesRequestRef.current) return
                const incoming = Array.isArray(res.data.messages) ? res.data.messages : []
                cacheMessages(target, incoming)
                setMsg((current) => {
                    // Keep messages still being sent so a socket refresh never
                    // makes an optimistic message disappear before the POST ends.
                    const pending = (current || []).filter((m) => m && m.pending && m.channel === target)
                    return pending.length ? [...incoming, ...pending] : incoming
                })
                setMessagesStatus('ready')
            } catch (error) {
                if (requestId !== messagesRequestRef.current) return
                // Only surface a blocking error when there is nothing to show;
                // a failed background refresh must never hide existing messages.
                setMessagesStatus((current) => (current === 'loading' ? 'error' : current))
                if (navigator.onLine && !silent) pushToast('Unable to load messages.', 'error')
                return
            }
            if (requestId !== messagesRequestRef.current) return
            if (nearBottom) {
                const el = tchatRef.current
                if (el) el.scrollTop = el.scrollHeight - el.clientHeight
                setNewBelow(false)
            } else {
                setNewBelow(true)
            }
        })()
        messagesRequestsRef.current[target] = { requestId, promise: request }
        request.finally(() => {
            const current = messagesRequestsRef.current[target]
            if (current && current.requestId === requestId) delete messagesRequestsRef.current[target]
        })
        return request
    }

    const scheduleSync = (delay = 200) => {
        clearTimeout(syncTimerRef.current)
        syncTimerRef.current = setTimeout(() => {
            const socket = socketRef.current
            if (!socket || !socket.connected) return
            if (!userRef.current || !userRef.current.username) loadProfile()
            if (userRef.current && userRef.current.username) {
                socket.emit('join', userRef.current.username)
            }
            fetchChannels().then((list) => {
                if (list && !list.some((channel) => channel.name === activeChannelRef.current)) {
                    changeChannel('general')
                }
            })
            fetchMessages(activeChannelRef.current, false, true)
        }, delay)
    }

    const reconnectNow = () => {
        const socket = socketRef.current
        if (!socket) return
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            setConnectionState('offline')
            return
        }
        const now = Date.now()
        if (now - reconnectGuardRef.current < 1200) {
            scheduleSync(300)
            return
        }
        reconnectGuardRef.current = now
        setSocketReady(false)
        setConnectionState('reconnecting')
        setReconnectAttempt(0)
        try {
            socket.io.reconnection(true)
            socket.io.reconnectionAttempts(Infinity)
            socket.io.reconnectionDelay(RECONNECT_DELAY_MS)
            socket.io.reconnectionDelayMax(RECONNECT_DELAY_MAX_MS)
            socket.disconnect()
            socket.connect()
        } catch (error) {
            // Socket.IO keeps retrying on its own if the manual cycle fails.
        }
        scheduleSync(600)
    }

    const retryLoads = (silent = false) => {
        const socket = socketRef.current
        const online = typeof navigator === 'undefined' || navigator.onLine
        if (socket && !socket.connected && online) reconnectNow()
        fetchChannels(silent).then((list) => {
            if (list && !list.some((channel) => channel.name === activeChannelRef.current)) {
                changeChannel('general')
            }
        })
        fetchMessages(activeChannelRef.current, true, silent)
    }
    retryLoadsRef.current = retryLoads

    // While the API is unreachable (often a sleeping free-host instance),
    // keep retrying quietly so the user does not have to tap Retry forever.
    useEffect(() => {
        if (!connected) return
        if (channelsStatus !== 'error' && messagesStatus !== 'error') return
        if (typeof navigator !== 'undefined' && !navigator.onLine) return
        const timer = setInterval(() => {
            if (retryLoadsRef.current) retryLoadsRef.current(true)
        }, 7000)
        return () => clearInterval(timer)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connected, channelsStatus, messagesStatus]);

    const resumeRealtime = () => {
        const socket = socketRef.current
        if (!socket) return
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            setConnectionState('offline')
            return
        }
        const hiddenFor = hiddenAtRef.current ? Date.now() - hiddenAtRef.current : 0
        hiddenAtRef.current = 0
        if (!socket.connected) {
            if (!everConnectedRef.current && !initialConnectFailedRef.current) {
                // First connection is still in flight: let Socket.IO finish.
                return
            }
            reconnectNow()
            return
        }
        if (hiddenFor > RESUME_RECONNECT_MS) {
            if (!disconnectedAtRef.current) {
                disconnectedAtRef.current = Date.now() - hiddenFor
            }
            reconnectNow()
            return
        }
        setConnectionState('live')
        scheduleSync(150)
    }

    const handleScroll = (e) => {
        const el = e.target
        if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) setNewBelow(false)
    }

    const scrollToLatest = () => {
        const el = tchatRef.current
        if (el) el.scrollTop = el.scrollHeight - el.clientHeight
        setNewBelow(false)
    }

    const autoGrow = () => {
        const el = inputRef.current
        if (!el) return
        el.style.height = 'auto'
        el.style.height = Math.min(el.scrollHeight, 140) + 'px'
    }

    const notifyTyping = () => {
        if (!socketRef.current || !socketReady) return
        const name = (userRef.current && userRef.current.username) || ''
        if (!name) return
        socketRef.current.emit('typing', { name, channel: activeChannelRef.current || 'general' })
        clearTimeout(typingTimerRef.current)
        typingTimerRef.current = setTimeout(() => stopTyping(), 2000)
    }

    const stopTyping = () => {
        clearTimeout(typingTimerRef.current)
        if (socketRef.current) {
            socketRef.current.emit('stopTyping', { channel: activeChannelRef.current || 'general' })
        }
    }

    const checkMessage = (e) => {
        const value = e.target.value
        setCharCount(value.length)
        autoGrow()
        if (value.trim()) notifyTyping()
        else stopTyping()
    }

    const clearInput = () => {
        if (inputRef.current) {
            inputRef.current.value = ''
            inputRef.current.style.height = 'auto'
        }
        setCharCount(0)
        setShowEmoji(false)
        setSending(false)
    }

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            submitMessage()
        }
    }

    const submitMessage = () => {
        if (sending) return
        const value = ((inputRef.current && inputRef.current.value) || '').trim()
        if (!value) return

        if (value.startsWith('/')) {
            runCommand(value)
            return
        }

        const author = (userRef.current && userRef.current.username) || ''
        if (!author) {
            // Never store a message under "Anonymous" just because the profile
            // request has not finished yet. Retry it so an eventual second
            // attempt can succeed even if the first fetch failed.
            loadProfile()
            pushToast('Your profile is still loading — try again in a moment.', 'warning')
            return
        }

        const text = value.slice(0, MAX_MESSAGE_LENGTH)
        const channel = activeChannelRef.current || 'general'
        const tempId = 'temp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
        const optimistic = {
            _id: tempId,
            message: text,
            author,
            authorId: myUserId || '',
            channel,
            createdAt: new Date().toISOString(),
            pending: true,
        }

        setSending(true)
        stopTyping()

        // Show the message immediately, before the API round-trip.
        setMsg((current) => [...(current || []), optimistic])
        setMessagesStatus('ready')
        setNewBelow(false)
        clearInput()
        requestAnimationFrame(() => {
            const el = tchatRef.current
            if (el) el.scrollTop = el.scrollHeight - el.clientHeight
        })
        if (!isMobile && inputRef.current) inputRef.current.focus()

        axios.post(config.api_url + '/api/messages/new', {
            message: text,
            author,
            authorId: myUserId || '',
            channel
        })
            .then((res) => {
                const saved = res.data && res.data.msg
                if (saved && saved._id) appendCachedMessage(channel, saved)
                if (activeChannelRef.current === channel) {
                    setMsg((current) => {
                        const withoutTemp = (current || []).filter((m) => m._id !== tempId)
                        if (!saved || !saved._id) return withoutTemp
                        // A socket refresh may already have fetched the saved message.
                        if (withoutTemp.some((m) => m._id === saved._id)) return withoutTemp
                        return [...withoutTemp, saved]
                    })
                }
                setSending(false)
                if (socketRef.current) {
                    socketRef.current.emit("newMsg", saved && saved._id
                        ? { channel, message: saved }
                        : { channel })
                }
                if (!isMobile && inputRef.current) inputRef.current.focus()
            })
            .catch(() => {
                if (activeChannelRef.current === channel) {
                    // Roll back the optimistic message and give the text back.
                    setMsg((current) => (current || []).filter((m) => m._id !== tempId))
                    if (inputRef.current && !inputRef.current.value) {
                        inputRef.current.value = text
                        setCharCount(text.length)
                        autoGrow()
                    }
                }
                setSending(false)
                pushToast('Message not sent. Check your connection.', 'error')
            })
    }

    const runCommand = (command) => {
        const name = command.split(/\s+/)[0]
        clearInput()
        if (name === '/delete') {
            deleteTchat()
            return
        }
        if (name === '/help') {
            pushToast('Commands: /delete clears the chat, /help shows this message.', 'info')
            return
        }
        pushToast('Unknown command. Try /help.', 'warning')
    }

    const deleteTchat = () => {
        const channel = activeChannelRef.current || 'general'
        axios.delete(config.api_url + '/api/messages', { params: { channel } }).then(() => {
            clearCachedMessages(channel)
            setMsg([])
            if (socketRef.current) socketRef.current.emit('resetTchat', { channel })
            pushToast(`#${channel} cleared.`, 'success')
        }).catch(() => pushToast(`Unable to clear #${channel}.`, 'error'))
    }

    const deleteMessage = (message) => {
        if (!window.confirm('Delete this message?')) return
        const channel = message.channel || activeChannelRef.current || 'general'
        axios.delete(config.api_url + '/api/messages/' + message._id, {
            data: { authorId: myUserId }
        }).then(() => {
            removeCachedMessage(channel, message._id)
            setMsg((current) => current.filter((m) => m._id !== message._id))
            if (socketRef.current) socketRef.current.emit('newMsg', { channel })
            pushToast('Message deleted.', 'success')
        }).catch(() => pushToast('Unable to delete this message.', 'error'))
    }

    const createChannel = (event) => {
        if (event) event.preventDefault()
        const name = newChannelName.trim().toLowerCase().replace(/^#/, '')
        if (!CHANNEL_PATTERN.test(name)) {
            pushToast('Use 1-24 lowercase letters, numbers or hyphens.', 'warning')
            return
        }
        if (channels.some((channel) => channel.name === name)) {
            setCreatingChannel(false)
            setNewChannelName('')
            changeChannel(name)
            pushToast(`#${name} already exists.`, 'info')
            return
        }

        axios.post(config.api_url + '/api/channels/new', { name })
            .then((res) => {
                const channel = res.data && res.data.channel
                const next = sortChannels([
                    ...channels.filter((item) => item.name !== name),
                    channel || { name, createdAt: new Date().toISOString() },
                ])
                setChannels(next)
                cacheChannels(next)
                setCreatingChannel(false)
                setNewChannelName('')
                changeChannel(name)
                if (socketRef.current) socketRef.current.emit('channelsChanged')
                pushToast(`#${name} created.`, 'success')
            })
            .catch((error) => {
                const apiError = error.response && error.response.data && error.response.data.error
                pushToast(typeof apiError === 'string' ? apiError : 'Unable to create channel.', 'error')
            })
    }

    const deleteChannel = (name) => {
        if (name === 'general') return
        if (!window.confirm(`Delete #${name} and all its messages?`)) return

        axios.delete(config.api_url + '/api/channels/' + encodeURIComponent(name))
            .then(() => {
                const next = channels.filter((channel) => channel.name !== name)
                setChannels(next)
                cacheChannels(next)
                clearCachedMessages(name)
                if (activeChannelRef.current === name) changeChannel('general')
                if (socketRef.current) socketRef.current.emit('channelDeleted', { channel: name })
                pushToast(`#${name} deleted.`, 'success')
            })
            .catch(() => pushToast(`Unable to delete #${name}.`, 'error'))
    }

    const copyMessage = (message) => {
        if (!navigator.clipboard) return
        navigator.clipboard.writeText(message.message)
            .then(() => pushToast('Message copied.', 'success'))
            .catch(() => pushToast('Unable to copy.', 'error'))
    }

    const pickEmoji = (emoji) => {
        if (!inputRef.current) return
        inputRef.current.value += emoji
        setCharCount(inputRef.current.value.length)
        autoGrow()
        notifyTyping()
        setShowEmoji(false)
        if (!isMobile) inputRef.current.focus()
    }

    const toggleSearch = () => {
        if (searchOpen) {
            setSearchOpen(false)
            setSearchTerm('')
        } else {
            setSearchOpen(true)
        }
    }

    const messages = msg || []
    const term = searchTerm.trim().toLowerCase()
    const filtered = term
        ? messages.filter((m) =>
            (m.message || '').toLowerCase().includes(term) ||
            (m.author || '').toLowerCase().includes(term))
        : messages

    const onlineCount = onlineUsers.length || userCount || 0
    const meTyping = typingName && (!user || typingName !== user.username)
    const connectionLabel = CONNECTION_LABELS[connectionState] || CONNECTION_LABELS.connecting
    const connectionClass = CONNECTION_LABELS[connectionState] ? connectionState : 'connecting'
    const isOnline = typeof navigator === 'undefined' || navigator.onLine
    const bootLoading = messagesStatus === 'loading'
    // The boot panel already explains the connection state while data loads;
    // the banner is for a realtime connection that stays down afterwards.
    const showConnectionBanner = !bootLoading && (
        connectionState === 'offline' ||
        ((connectionState === 'connecting' || connectionState === 'reconnecting') && slowConnection)
    )
    const connectionHint = connectionState === 'offline'
        ? "You're offline. Messages stay on screen and will sync when the network returns."
        : connectionState === 'connecting'
            ? 'Connecting to the realtime server… it may be waking up. Messages will load as soon as it answers.'
            : reconnectAttempt > 1
                ? `Reconnecting… attempt ${reconnectAttempt}. New messages will sync automatically.`
                : 'Reconnecting… new messages will sync as soon as the connection is back.';

    const realtimeStep = socketReady || connectionState === 'live'
        ? 'done'
        : connectionState === 'offline'
            ? 'error'
            : 'active'
    const channelsStep = channelsStatus === 'ready' ? 'done' : channelsStatus === 'error' ? 'error' : 'active'
    const messagesStep = messagesStatus === 'ready' ? 'done' : messagesStatus === 'error' ? 'error' : 'active'
    const bootTitle = !isOnline
        ? "You're offline"
        : slowBoot
            ? 'Still connecting to Socket Chat…'
            : 'Connecting to Socket Chat…'
    const bootHint = !isOnline
        ? 'We will load your channels and messages as soon as the network comes back.'
        : slowBoot
            ? 'The server may be waking up. Free hosting can take up to a minute on the first visit.'
            : 'Starting the realtime connection and loading your channels and messages.'

    const buildTimeline = () => {
        const items = []
        let previous = null

        filtered.forEach((message, index) => {
            const key = dayKey(message.createdAt)
            if (!previous || key !== previous.dayKey) {
                items.push(
                    <li className="day-separator" key={'day-' + key + '-' + (message._id || index)}>
                        <span>{formatDay(message.createdAt)}</span>
                    </li>
                )
                previous = null
            }

            const own = message.authorId && message.authorId === myUserId
            const author = message.author || 'Anonymous'
            const canGroup = previous &&
                previous.authorId === message.authorId &&
                previous.author === message.author &&
                message.createdAt && previous.createdAt &&
                (new Date(message.createdAt) - new Date(previous.createdAt)) < GROUP_WINDOW_MS

            items.push(
                <li
                    key={message._id || 'message-' + index}
                    className={'msg' + (canGroup ? ' grouped' : '') + (own ? ' own' : '')}
                >
                    <div className="msg-gutter">
                        {!canGroup && (
                            <span className="avatar" style={{ background: avatarColor(author) }}>
                                {initials(author)}
                            </span>
                        )}
                    </div>
                    <div className="msg-body">
                        {!canGroup && (
                            <div className="msg-head">
                                <span className="msg-author">{own ? 'You' : author}</span>
                                {formatTime(message.createdAt) && (
                                    <span className="msg-time">{formatTime(message.createdAt)}</span>
                                )}
                            </div>
                        )}
                        <div className="msg-text">{message.message}</div>
                    </div>
                    <div className="msg-actions">
                        <button type="button" title="Copy message" onClick={() => copyMessage(message)}>
                            <IconCopy />
                        </button>
                        {own && !message.pending && (
                            <button type="button" className="danger" title="Delete message" onClick={() => deleteMessage(message)}>
                                <IconTrash />
                            </button>
                        )}
                    </div>
                </li>
            )

            previous = { ...message, dayKey: key }
        })

        return items
    }

    return (
        <div id="Home">
            <Nav connected={connected} username={user && user.username} />

            {connected ? (
                <div className="chat-shell">

                    <aside className={'chat-sidebar' + (sidebarOpen ? ' open' : '')}>
                        <div className="sidebar-brand">
                            <Link to="/" className="sidebar-brand-link" aria-label="Socket Chat">
                                <span className="nav-logo sidebar-logo" aria-hidden="true"></span>
                                <span className="sidebar-brand-copy">
                                    <strong>Socket Chat</strong>
                                    <span>Realtime rooms</span>
                                </span>
                            </Link>
                        </div>

                        <div className="sidebar-section sidebar-channels" aria-busy={channelsStatus === 'loading'}>
                            <span className="sidebar-label">
                                <span>Channels</span>
                                <button
                                    type="button"
                                    className="channel-add"
                                    title="New channel"
                                    aria-label="New channel"
                                    onClick={() => {
                                        setCreatingChannel(!creatingChannel)
                                        setNewChannelName('')
                                    }}
                                >
                                    +
                                </button>
                            </span>

                            {creatingChannel && (
                                <form className="channel-create" onSubmit={createChannel}>
                                    <span className="channel-hash">#</span>
                                    <input
                                        ref={channelInputRef}
                                        type="text"
                                        value={newChannelName}
                                        maxLength={24}
                                        placeholder="new-channel"
                                        aria-label="New channel name"
                                        onChange={(e) => setNewChannelName(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Escape') {
                                                e.stopPropagation()
                                                setCreatingChannel(false)
                                                setNewChannelName('')
                                            }
                                        }}
                                    />
                                    <button type="submit" aria-label="Create channel" title="Create channel">
                                        ↵
                                    </button>
                                </form>
                            )}

                            {channelsStatus === 'loading' && channels.length === 0 ? (
                                <ul className="channel-skeleton" aria-hidden="true">
                                    <li /><li /><li />
                                </ul>
                            ) : (
                                <ul className="channel-list">
                                    {channels.map((channel) => (
                                        <li
                                            key={channel.name}
                                            className={'channel-item' + (channel.name === activeChannel ? ' active' : '')}
                                        >
                                            <button
                                                type="button"
                                                className="channel"
                                                title={`#${channel.name}`}
                                                onClick={() => changeChannel(channel.name)}
                                            >
                                                <span className="channel-hash">#</span>
                                                <span className="channel-name">{channel.name}</span>
                                            </button>
                                            {channel.name !== 'general' && (
                                                <button
                                                    type="button"
                                                    className="channel-delete"
                                                    title={`Delete #${channel.name}`}
                                                    aria-label={`Delete #${channel.name}`}
                                                    onClick={() => deleteChannel(channel.name)}
                                                >
                                                    <IconTrash />
                                                </button>
                                            )}
                                        </li>
                                    ))}
                                    {channelsStatus === 'error' && (
                                        <li className="sidebar-error">
                                            <span>Channels unavailable</span>
                                            <button type="button" onClick={() => retryLoads()}>Retry</button>
                                        </li>
                                    )}
                                </ul>
                            )}
                        </div>

                        <div className="sidebar-section sidebar-online">
                            <span className="sidebar-label">Online — {onlineCount}</span>
                            <ul className="presence-list">
                                {onlineUsers.length > 0 ? Array.from(new Map(onlineUsers.map(u => [u.name, u])).values()).map((online) => (
                                    <li
                                        key={online.id}
                                        className={'presence-item' + (online.id === socketId ? ' self' : '')}
                                    >
                                        <span className="presence-avatar" style={{ background: avatarColor(online.name) }}>{initials(online.name)}</span>
                                        <span className="presence-name">
                                            {online.name || 'Anonymous'}
                                            {online.id === socketId ? ' (you)' : ''}
                                        </span>
                                        <span className="presence-dot" aria-hidden="true"></span>
                                    </li>
                                )) : (
                                    <li className="presence-empty">
                                        {connectionState === 'live' ? 'No one else here yet.' : 'Connecting to presence…'}
                                    </li>
                                )}
                            </ul>
                        </div>

                        <div className="sidebar-footer">
                            <div className="sidebar-user">
                                <span className="presence-avatar accent sidebar-user-avatar">{initials(user && user.username)}</span>
                                <div className="sidebar-user-meta">
                                    <strong>{user && user.username ? user.username : '…'}</strong>
                                    <span className={'sidebar-user-status' + (connectionState === 'live' ? ' live' : '')}>
                                        <i aria-hidden="true"></i>
                                        {connectionState === 'live' ? 'Online' : connectionLabel}
                                    </span>
                                </div>
                            </div>
                            <div className="sidebar-footer-actions">
                                <Link to="/about" className="sidebar-version" title="About Socket Chat">v{APP_VERSION}</Link>
                                <button
                                    type="button"
                                    className="sidebar-logout"
                                    title="Log out"
                                    aria-label="Log out"
                                    onClick={() => {
                                        Object.keys(localStorage)
                                            .filter((key) => key.indexOf('socket-chat-cache-v') === 0)
                                            .forEach((key) => localStorage.removeItem(key))
                                        localStorage.removeItem('JWT')
                                        localStorage.removeItem(USERNAME_KEY)
                                        window.location.reload()
                                    }}
                                >
                                    <IconLogout />
                                </button>
                            </div>
                        </div>
                    </aside>

                    {sidebarOpen && (
                        <button
                            type="button"
                            className="sidebar-overlay"
                            aria-label="Close sidebar"
                            onClick={() => setSidebarOpen(false)}
                        ></button>
                    )}

                    <main className="chat-main">
                        <header className="chat-topbar">
                            <button
                                type="button"
                                className="icon-btn sidebar-toggle"
                                aria-label="Toggle sidebar"
                                onClick={() => setSidebarOpen(!sidebarOpen)}
                            >
                                <IconMenu />
                            </button>

                            <div className="chat-heading">
                                <span className="channel-avatar" aria-hidden="true">#</span>
                                <div className="chat-heading-copy">
                                    <h1>{activeChannel}</h1>
                                    <p>{connectionState === 'live' ? `${onlineCount} online` : connectionLabel}</p>
                                </div>
                            </div>

                            {onlineUsers.length > 0 && (
                                <div className="chat-presence-stack" aria-hidden="true">
                                    {onlineUsers.slice(0, 3).map((online) => (
                                        <span
                                            key={online.id}
                                            className="presence-mini"
                                            style={{ background: avatarColor(online.name) }}
                                        >
                                            {initials(online.name)}
                                        </span>
                                    ))}
                                    {onlineUsers.length > 3 && (
                                        <span className="presence-mini more">+{onlineUsers.length - 3}</span>
                                    )}
                                </div>
                            )}

                            <div className="chat-actions">
                                <button
                                    type="button"
                                    className={'icon-btn' + (searchOpen ? ' active' : '')}
                                    aria-label="Search messages"
                                    onClick={toggleSearch}
                                >
                                    <IconSearch />
                                </button>
                                {activeChannel === 'general' && (
                                    <button
                                        type="button"
                                        className="icon-btn"
                                        aria-label="Clear the chat"
                                        title="Clear all messages in #general"
                                        onClick={() => setShowClearDialog(true)}
                                    >
                                        <IconTrash />
                                    </button>
                                )}
                                <span
                                    className={'conn-pill ' + connectionClass}
                                    role="status"
                                    aria-live="polite"
                                    title={`Realtime connection: ${connectionLabel.toLowerCase()}`}
                                >
                                    <span className="conn-dot" aria-hidden="true" />
                                    {connectionLabel}
                                </span>
                            </div>
                        </header>

                        {searchOpen && (
                            <div className="chat-searchbar">
                                <IconSearch />
                                <input
                                    type="text"
                                    autoFocus
                                    value={searchTerm}
                                    placeholder={`Search #${activeChannel}…`}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                                <span className="results">{filtered.length} result{filtered.length === 1 ? '' : 's'}</span>
                                <button type="button" className="icon-btn" aria-label="Close search" onClick={toggleSearch}>
                                    ×
                                </button>
                            </div>
                        )}

                        {showConnectionBanner && (
                            <div
                                className={'conn-banner ' + connectionClass}
                                role="status"
                                aria-live="polite"
                            >
                                <span className="conn-banner-dot" aria-hidden="true" />
                                <span className="conn-banner-text">{connectionHint}</span>
                                <button type="button" className="conn-retry" onClick={reconnectNow}>
                                    {connectionState === 'offline' ? 'Retry' : 'Retry now'}
                                </button>
                            </div>
                        )}

                        <ul id="tchat" onScroll={handleScroll} ref={tchatRef}>
                            {messagesStatus === 'loading' ? (
                                <div className="chat-state chat-boot" role="status" aria-live="polite">
                                    <div className="loader-ring" aria-hidden="true"></div>
                                    <h3>{bootTitle}</h3>
                                    <p>{bootHint}</p>
                                    <ul className="boot-steps">
                                        <li className={'boot-step ' + realtimeStep}>
                                            <span className="boot-step-dot" aria-hidden="true" />
                                            <span>Realtime connection</span>
                                            <em>{realtimeStep === 'done' ? 'Ready' : realtimeStep === 'error' ? 'Offline' : 'Connecting…'}</em>
                                        </li>
                                        <li className={'boot-step ' + channelsStep}>
                                            <span className="boot-step-dot" aria-hidden="true" />
                                            <span>Channels</span>
                                            <em>{channelsStep === 'done' ? 'Loaded' : channelsStep === 'error' ? 'Unavailable' : 'Loading…'}</em>
                                        </li>
                                        <li className={'boot-step ' + messagesStep}>
                                            <span className="boot-step-dot" aria-hidden="true" />
                                            <span>Messages</span>
                                            <em>{messagesStep === 'done' ? 'Loaded' : messagesStep === 'error' ? 'Unavailable' : 'Loading…'}</em>
                                        </li>
                                    </ul>
                                    {(slowBoot || realtimeStep === 'error') && (
                                        <button type="button" className="state-action" onClick={() => retryLoads()}>
                                            Retry now
                                        </button>
                                    )}
                                </div>
                            ) : messagesStatus === 'error' ? (
                                <div className="chat-state chat-error" role="alert">
                                    <div className="empty-emoji" aria-hidden="true">📡</div>
                                    <h3>{isOnline ? "Can't reach the chat server" : "You're offline"}</h3>
                                    <p>
                                        {isOnline
                                            ? "The server may still be waking up. We'll retry automatically — or try again now."
                                            : "Your messages will appear as soon as you're back online. We'll retry automatically."}
                                    </p>
                                    <button type="button" className="state-action" onClick={() => retryLoads()}>Try again</button>
                                </div>
                            ) : filtered.length === 0 ? (
                                <div className="chat-state chat-empty">
                                    <div className="empty-emoji" aria-hidden="true">{term ? '🔍' : '💬'}</div>
                                    <h3>{term ? 'No matching messages' : 'No messages yet'}</h3>
                                    <p>{term ? 'Try a different search.' : `Be the first to say hello in #${activeChannel}.`}</p>
                                </div>
                            ) : buildTimeline()}

                            {newBelow && (
                                <button type="button" id="jumpLatest" onClick={scrollToLatest}>
                                    ↓ New messages
                                </button>
                            )}
                        </ul>

                        <div id="chatFooter">
                            <div className="typing">
                                {socketReady && meTyping ? (
                                    <>{typingName} is typing<span className="typing-dots"><i></i><i></i><i></i></span></>
                                ) : ''}
                            </div>

                            <form id="messageForm" onSubmit={(e) => { e.preventDefault(); submitMessage() }}>
                                {showEmoji && (
                                    <div id="emojiPicker" ref={emojiRef}>
                                        {EMOJIS.map((emoji) => (
                                            <button
                                                key={emoji}
                                                type="button"
                                                onMouseDown={(e) => e.preventDefault()}
                                                onClick={() => pickEmoji(emoji)}
                                            >
                                                {emoji}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                <div className="composer">
                                    <button
                                        ref={emojiBtnRef}
                                        type="button"
                                        className="composer-btn"
                                        aria-label="Add emoji"
                                        title="Emoji"
                                        onClick={() => setShowEmoji(!showEmoji)}
                                    >
                                        😊
                                    </button>

                                    <textarea
                                        id="message"
                                        ref={inputRef}
                                        rows={1}
                                        maxLength={MAX_MESSAGE_LENGTH}
                                        placeholder={`Message #${activeChannel}`}
                                        onChange={checkMessage}
                                        onKeyDown={handleKeyDown}
                                        onBlur={() => stopTyping()}
                                        autoFocus={!isMobile}
                                    ></textarea>

                                    <button
                                        type="submit"
                                        className="send-btn"
                                        aria-label="Send message"
                                        title="Send"
                                        disabled={!charCount || sending}
                                    >
                                        {sending ? <span className="spinner" aria-hidden="true"></span> : <IconSend />}
                                    </button>
                                </div>

                                <div className="composer-meta">
                                    <span className={charCount > MAX_MESSAGE_LENGTH - 50 ? 'warn' : ''}>
                                        {charCount}/{MAX_MESSAGE_LENGTH}
                                    </span>
                                    <span className="composer-hint">Enter to send · Shift+Enter for a new line</span>
                                </div>
                            </form>
                        </div>

                        {showClearDialog && (
                            <div className="clear-overlay" onClick={() => setShowClearDialog(false)} role="dialog" aria-modal="true" aria-labelledby="clear-dialog-title">
                                <div className="clear-dialog" onClick={(e) => e.stopPropagation()}>
                                    <h3 id="clear-dialog-title">Clear #general?</h3>
                                    <p>This will delete every message in this channel for everyone. It cannot be undone.</p>
                                    <div className="clear-actions">
                                        <button type="button" className="clear-btn clear-cancel" onClick={() => setShowClearDialog(false)}>Cancel</button>
                                        <button type="button" className="clear-btn clear-danger" onClick={() => { setShowClearDialog(false); deleteTchat(); }}>Clear all messages</button>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="toast-stack" aria-live="polite">
                            {toasts.map((toast) => (
                                <div key={toast.id} className={'toast ' + toast.type}>{toast.message}</div>
                            ))}
                        </div>
                    </main>
                </div>
            ) : (
                <div className="auth-screen">
                    <Login getLogged={getLogged} />
                </div>
            )}
        </div>
    );
};

export default Home;
