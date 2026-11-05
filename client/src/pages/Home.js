import React, { useEffect, useRef } from "react";
import Nav from '../components/Nav';
import socketIOClient from "socket.io-client";
import axios from "axios";
import { useStateIfMounted } from "use-state-if-mounted";
import Login from "../components/Login";
import { Link } from "react-router-dom";

const APP_VERSION = process.env.REACT_APP_VERSION || '2.0.2';
const EMOJIS = ['😀', '😂', '😍', '👍', '🔥', '🎉', '❤️', '🤔', '😅', '🙏', '🚀', '💯'];
const MAX_MESSAGE_LENGTH = 500;
const GROUP_WINDOW_MS = 5 * 60 * 1000;
const AVATAR_PALETTE = ['#5b7cfa', '#7a6ff0', '#4f9cf9', '#43b3a8', '#d7746b', '#c98a4b', '#8f7ec9', '#5fa06f'];

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

const Home = () => {
    const [msg, setMsg] = useStateIfMounted([])
    const [sending, setSending] = useStateIfMounted(false)
    const [userCount, setUserCount] = useStateIfMounted()
    const [socketReady, setSocketReady] = useStateIfMounted(false)
    const [socketId, setSocketId] = useStateIfMounted(null)
    const [onlineUsers, setOnlineUsers] = useStateIfMounted([])
    const [user, setUser] = useStateIfMounted()
    const [connected, setConnected] = useStateIfMounted(false)
    const [typingName, setTypingName] = useStateIfMounted('')
    const [unread, setUnread] = useStateIfMounted(0)
    const [showEmoji, setShowEmoji] = useStateIfMounted(false)
    const [charCount, setCharCount] = useStateIfMounted(0)
    const [newBelow, setNewBelow] = useStateIfMounted(false)
    const [hasLoaded, setHasLoaded] = useStateIfMounted(false)
    const [searchOpen, setSearchOpen] = useStateIfMounted(false)
    const [searchTerm, setSearchTerm] = useStateIfMounted('')
    const [sidebarOpen, setSidebarOpen] = useStateIfMounted(false)
    const [toasts, setToasts] = useStateIfMounted([])

    const socketRef = useRef()
    const inputRef = useRef()
    const tchatRef = useRef()
    const typingTimerRef = useRef()
    const emojiRef = useRef()
    const emojiBtnRef = useRef()

    const config = require('../config.json')
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const myUserId = localStorage.getItem('JWT') ? JSON.parse(localStorage.getItem('JWT')).userId : null;

    useEffect(() => {
        if (localStorage.getItem('JWT') && JSON.parse(localStorage.getItem('JWT')).expiry > new Date().getTime()) {
            getLogged(true)
        } else {
            setConnected(false)
            localStorage.removeItem("JWT")
        }

        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }
            clearTimeout(typingTimerRef.current)
        };
        // eslint-disable-next-line
    }, []);

    useEffect(() => {
        document.title = unread
            ? `(${unread}) new message${unread > 1 ? 's' : ''} — Socket Chat`
            : 'Socket Chat'
    }, [unread]);

    useEffect(() => {
        const clearUnread = () => {
            if (!document.hidden) setUnread(0)
        }
        document.addEventListener('visibilitychange', clearUnread)
        window.addEventListener('focus', clearUnread)
        return () => {
            document.removeEventListener('visibilitychange', clearUnread)
            window.removeEventListener('focus', clearUnread)
        }
        // eslint-disable-next-line
    }, []);

    useEffect(() => {
        if (socketReady && socketRef.current) {
            socketRef.current.emit('join', (user && user.username) || 'Anonymous')
        }
    }, [socketReady, user]);

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') {
                setShowEmoji(false)
                setSearchOpen(false)
                setSearchTerm('')
                setSidebarOpen(false)
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
        })
        socketRef.current = socket

        socket.on("connect", () => {
            setSocketReady(true)
            setSocketId(socket.id)
        })
        socket.on("disconnect", () => {
            setSocketReady(false)
            setTypingName('')
        })
        socket.on("connect_error", () => {
            setSocketReady(false)
        })

        socket.on("newMsg", () => {
            if (document.hidden) setUnread((current) => (current || 0) + 1)
            fetchMessages()
        })
        socket.on("reset", () => {
            setMsg([])
            fetchMessages()
        })
        socket.on('count', (count) => {
            setUserCount(count)
        })
        socket.on('presence', (users) => {
            setOnlineUsers(Array.isArray(users) ? users : [])
        })
        socket.on("typing", (data) => {
            const name = data && typeof data.name === 'string' ? data.name : ''
            setTypingName(name.trim().slice(0, 12))
        })
        socket.on("stopTyping", () => {
            setTypingName('')
        })
    }

    const getLogged = async (isConnected) => {
        setupSocket()
        setConnected(isConnected)
        fetchMessages()
        getUsername().then((username) => {
            setUser({
                userId: JSON.parse(localStorage.getItem('JWT')).userId,
                JWT: JSON.parse(localStorage.getItem('JWT')).token,
                username: username
            })
        })
    }

    const getUsername = async () => {
        let username = "";
        await axios.get(config.api_url + '/api/secure/' + JSON.parse(localStorage.getItem('JWT')).userId).then((res) => {
            username = res.data.user.pseudo
        })
        return username
    }

    const fetchMessages = async () => {
        const list = tchatRef.current
        const nearBottom = !list || (list.scrollHeight - list.scrollTop - list.clientHeight < 150)
        await axios.get(config.api_url + '/api/messages')
            .then(res => {
                const incoming = Array.isArray(res.data.messages) ? res.data.messages : []
                setMsg((current) => {
                    // Keep messages still being sent so a socket refresh never
                    // makes an optimistic message disappear before the POST ends.
                    const pending = (current || []).filter((m) => m && m.pending)
                    return pending.length ? [...incoming, ...pending] : incoming
                })
            })
            .catch(() => pushToast('Unable to load messages.', 'error'))
        setHasLoaded(true)
        if (nearBottom) {
            const el = tchatRef.current
            if (el) el.scrollTop = el.scrollHeight - el.clientHeight
            setNewBelow(false)
        } else {
            setNewBelow(true)
        }
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
        const name = (user && user.username) || 'Anonymous'
        socketRef.current.emit('typing', name)
        clearTimeout(typingTimerRef.current)
        typingTimerRef.current = setTimeout(() => stopTyping(), 2000)
    }

    const stopTyping = () => {
        clearTimeout(typingTimerRef.current)
        if (socketRef.current) socketRef.current.emit('stopTyping')
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

        const text = value.slice(0, MAX_MESSAGE_LENGTH)
        const author = (user && user.username) || 'Anonymous'
        const tempId = 'temp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
        const optimistic = {
            _id: tempId,
            message: text,
            author,
            authorId: myUserId || '',
            createdAt: new Date().toISOString(),
            pending: true,
        }

        setSending(true)
        stopTyping()

        // Show the message immediately, before the API round-trip.
        setMsg((current) => [...(current || []), optimistic])
        setHasLoaded(true)
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
            authorId: myUserId || ''
        })
            .then((res) => {
                const saved = res.data && res.data.msg
                setMsg((current) => {
                    const withoutTemp = (current || []).filter((m) => m._id !== tempId)
                    if (!saved || !saved._id) return withoutTemp
                    // A socket refresh may already have fetched the saved message.
                    if (withoutTemp.some((m) => m._id === saved._id)) return withoutTemp
                    return [...withoutTemp, saved]
                })
                setSending(false)
                if (socketRef.current) socketRef.current.emit("newMsg")
                if (!isMobile && inputRef.current) inputRef.current.focus()
            })
            .catch(() => {
                // Roll back the optimistic message and give the text back.
                setMsg((current) => (current || []).filter((m) => m._id !== tempId))
                if (inputRef.current && !inputRef.current.value) {
                    inputRef.current.value = text
                    setCharCount(text.length)
                    autoGrow()
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
        if (!window.confirm('/delete clears the whole conversation for everyone. Continue?')) return
        axios.delete(config.api_url + '/api/messages').then(() => {
            setMsg([])
            if (socketRef.current) socketRef.current.emit('resetTchat')
            pushToast('Conversation cleared.', 'success')
        }).catch(() => pushToast('Unable to clear the conversation.', 'error'))
    }

    const deleteMessage = (message) => {
        if (!window.confirm('Delete this message?')) return
        axios.delete(config.api_url + '/api/messages/' + message._id, {
            data: { authorId: myUserId }
        }).then(() => {
            setMsg((current) => current.filter((m) => m._id !== message._id))
            if (socketRef.current) socketRef.current.emit('newMsg')
            pushToast('Message deleted.', 'success')
        }).catch(() => pushToast('Unable to delete this message.', 'error'))
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
                        <div className="sidebar-section">
                            <span className="sidebar-label">Channel</span>
                            <div className="channel">
                                <span className="channel-hash">#</span>
                                general
                                <span className="badge-count">{onlineCount}</span>
                            </div>
                        </div>

                        <div className="sidebar-section sidebar-online">
                            <span className="sidebar-label">Online — {onlineCount}</span>
                            <ul className="presence-list">
                                {onlineUsers.length > 0 ? onlineUsers.map((online) => (
                                    <li
                                        key={online.id}
                                        className={'presence-item' + (online.id === socketId ? ' self' : '')}
                                    >
                                        <span className="presence-avatar">{initials(online.name)}</span>
                                        <span className="presence-name">
                                            {online.name || 'Anonymous'}
                                            {online.id === socketId ? ' (you)' : ''}
                                        </span>
                                        <span className="presence-dot" aria-hidden="true"></span>
                                    </li>
                                )) : (
                                    <li className="presence-empty">Waiting for presence…</li>
                                )}
                            </ul>
                        </div>

                        <div className="sidebar-footer">
                            <div className="sidebar-user">
                                <span className="presence-avatar accent">{initials(user && user.username)}</span>
                                <div>
                                    <strong>{user && user.username ? user.username : '…'}</strong>
                                    <span>Signed in</span>
                                </div>
                            </div>
                            <Link to="/about" className="sidebar-version">v{APP_VERSION}</Link>
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
                                <h1># general</h1>
                                <p>{socketReady ? `${onlineCount} online` : 'Reconnecting…'}</p>
                            </div>

                            <div className="chat-actions">
                                <button
                                    type="button"
                                    className={'icon-btn' + (searchOpen ? ' active' : '')}
                                    aria-label="Search messages"
                                    onClick={toggleSearch}
                                >
                                    <IconSearch />
                                </button>
                                <span className={'conn-pill' + (socketReady ? ' ok' : ' down')}>
                                    {socketReady ? 'Live' : 'Offline'}
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
                                    placeholder="Search this conversation…"
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                                <span className="results">{filtered.length} result{filtered.length === 1 ? '' : 's'}</span>
                                <button type="button" className="icon-btn" aria-label="Close search" onClick={toggleSearch}>
                                    ×
                                </button>
                            </div>
                        )}

                        {!socketReady && (
                            <div className="conn-banner">Realtime connection lost — reconnecting… Messages still send over HTTPS.</div>
                        )}

                        <ul id="tchat" onScroll={handleScroll} ref={tchatRef}>
                            {!hasLoaded ? (
                                <div className="chat-state">
                                    <div className="loader-ring" aria-hidden="true"></div>
                                    <h3>Loading messages…</h3>
                                </div>
                            ) : filtered.length === 0 ? (
                                <div className="chat-state chat-empty">
                                    <div className="empty-emoji" aria-hidden="true">{term ? '🔍' : '💬'}</div>
                                    <h3>{term ? 'No matching messages' : 'No messages yet'}</h3>
                                    <p>{term ? 'Try a different search.' : 'Be the first to say hello in #general.'}</p>
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
                                        placeholder="Message #general"
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
