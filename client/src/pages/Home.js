import React, { useEffect, useRef } from "react";
import Nav from '../components/Nav';
import socketIOClient from "socket.io-client";
import axios from "axios";
import { useStateIfMounted } from "use-state-if-mounted";
import Login from "../components/Login";
import { useNavigate } from "react-router-dom";

const APP_VERSION = process.env.REACT_APP_VERSION || '2.0.0';
const EMOJIS = ['😀', '😂', '😍', '👍', '🔥', '🎉', '❤️', '🤔', '😅', '🙏', '🚀', '💯'];
const MAX_MESSAGE_LENGTH = 500;
const AVATAR_PALETTE = ['#2979ff', '#8e24aa', '#e53935', '#f4511e', '#2e7d32', '#00897b', '#039be5', '#6d4c41', '#6a1b9a'];

const Home = () => {
    const [msg, setMsg] = useStateIfMounted([])
    const [submitted, setSubmitted] = useStateIfMounted(false)
    const [errors, setErrors] = useStateIfMounted()
    const sendBtn = useRef()
    const tchatRef = useRef()
    const typingTimerRef = useRef()
    const [userCount, setUserCount] = useStateIfMounted()
    const [socketReady, setSocketReady] = useStateIfMounted(false)
    const socketRef = useRef()
    const [user, setUser] = useStateIfMounted()
    const [connected, setConnected] = useStateIfMounted(false)
    const [showedWarning, setShowedWarning] = useStateIfMounted(false)
    const [typingName, setTypingName] = useStateIfMounted('')
    const [unread, setUnread] = useStateIfMounted(0)
    const [showEmoji, setShowEmoji] = useStateIfMounted(false)
    const [charCount, setCharCount] = useStateIfMounted(0)
    const [newBelow, setNewBelow] = useStateIfMounted(false)
    const navigate = useNavigate()
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



    const sendMessage = (e) => {
        e.preventDefault();
        if (!socketReady) return
        let value = document.getElementById('message').value.trim()
        if (!value) {
            updateComposer('')
            return
        }
        let newMessage = {
            message: value.slice(0, MAX_MESSAGE_LENGTH)
        }
        setSubmitted(true)
        setShowEmoji(false)
        stopTyping()
        if (newMessage.message.startsWith('/')) {
            tchatCommands(newMessage.message)
        } else {
            postMessage(newMessage);
        }


    }

    const tchatCommands = (command) => {
        switch (command) {
            case '/delete':
                deleteTchat()
                break;
            default:
                let message = "commands available: /delete"
                !showedWarning && showWarningHelper(message)
                break;
        }
        document.getElementById('message').value = ""
        updateComposer('')
        setSubmitted(false)
    }


    const showWarningHelper = (message) => {
        const helper = document.createElement('li')
        helper.classList.add('text-warning', 'msg-warning')
        helper.textContent = message
        setShowedWarning(true)
        setSubmitted(false)
        document.getElementById('tchat').appendChild(helper)
        document.getElementById('message').value = ""
        setTimeout(() => {
            helper.remove()
            setShowedWarning(false)
        }, 5000)
    }

    const setupSocket = () => {
        if (socketRef.current) return

        const socket = socketIOClient(config.socket_url, {
            transports: ['websocket'],
        })
        socketRef.current = socket

        socket.on("connect", () => {
            setSocketReady(true)
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

        socket.on("typing", (data) => {
            const name = data && typeof data.name === 'string' ? data.name : ''
            setTypingName(name.trim().slice(0, 12))
        })
        socket.on("stopTyping", () => {
            setTypingName('')
        })
    }

    const getLogged = async (connected) => {
        setupSocket()
        setConnected(connected)
        fetchMessages()
        getUsername().then((username) => {
            setUser({
                userId: JSON.parse(localStorage.getItem('JWT')).userId,
                JWT: JSON.parse(localStorage.getItem('JWT')).token,
                username: username
            })
        })
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

    const postMessage = (newMessage) => {
        axios.post(config.api_url + '/api/messages/new', {
            ...newMessage,
            author: (user && user.username) || 'Anonymous',
            authorId: myUserId || ''
        })
            .then(() => {
                if (socketRef.current) socketRef.current.emit("newMsg")
                document.getElementById('message').value = ""
                updateComposer('')
                setSubmitted(false)
                sendBtn.current.setAttribute("disabled", "disabled")
                !isMobile && document.getElementById("message").focus()
            })
            .catch(() => {
                setSubmitted(false)
                setErrors("Message not sent")
            })
    }


    const fetchMessages = async () => {
        const list = tchatRef.current
        const nearBottom = !list || (list.scrollHeight - list.scrollTop - list.clientHeight < 150)
        await axios.get(config.api_url + '/api/messages')
            .then(res => setMsg(res.data.messages))
            .catch(error => console.log(error))
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

    if (errors) {
        setTimeout(() => {
            setErrors("")
        }, 1500)
    }

    const updateComposer = (value) => {
        setCharCount(value.length)
        if (sendBtn.current) {
            if (value === "" || !socketReady) {
                sendBtn.current.setAttribute("disabled", "disabled")
            } else {
                sendBtn.current.removeAttribute("disabled")
            }
        }
    }

    const checkMessage = (e) => {
        updateComposer(e.target.value)
        if (e.target.value.trim()) notifyTyping()
    }

    const toggleEmoji = () => {
        setShowEmoji(!showEmoji)
    }

    const pickEmoji = (emoji) => {
        const input = document.getElementById('message')
        if (!input) return
        input.value += emoji
        updateComposer(input.value)
        notifyTyping()
        setShowEmoji(false)
        !isMobile && input.focus()
    }

    const formatTime = (iso) => {
        if (!iso) return ''
        const d = new Date(iso)
        if (isNaN(d.getTime())) return ''
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    const initials = (name) => (name || '?').trim().slice(0, 1).toUpperCase()

    const avatarColor = (name) => {
        let hash = 0
        for (const c of String(name || '')) hash = (hash * 31 + c.charCodeAt(0)) % AVATAR_PALETTE.length
        return AVATAR_PALETTE[hash]
    }

    const brandLink = () => {
        navigate('/')
    }

    const aboutLink = () => {
        navigate('/about')
    }


    const getUsername = async () => {
        let username = "";
        await axios.get(config.api_url + '/api/secure/' + JSON.parse(localStorage.getItem('JWT')).userId).then((res) => {
            username = res.data.user.pseudo
        })
        return username
    }

    const deleteTchat = () => {
        axios.delete(config.api_url + '/api/messages').then(() => {
            setMsg([])
            if (socketRef.current) socketRef.current.emit('resetTchat')
        })
    }

    const meTyping = typingName && (!user || typingName !== user.username)

    return (
        <div id="Home">
            <Nav brandLink={brandLink} connected={connected} username={user && user.username} aboutLink={aboutLink}></Nav>
            {connected && (
                <div id="chatWindow">

                    <div id="chatHeader">
                        <div className="chat-brand">
                            <span id="chatIcon"></span>
                            <span className="chat-title">Socket Chat</span>
                            <span id="chatVersion">v{APP_VERSION}</span>
                        </div>
                        <div className="chat-status">
                            <span className={'status-dot' + (socketReady ? ' online' : '')}></span>
                            {socketReady && userCount
                                ? <>{userCount} online</>
                                : <span className="status-connecting">connecting…</span>}
                        </div>
                    </div>

                    <ul id="tchat" onScroll={handleScroll} ref={tchatRef}>
                        {!socketReady || !userCount ? (
                            <div className="chat-connecting">
                                <h3>
                                    Connexion au tchat en cours
                                    <div className="loading-dots">
                                        <span className="dot" id="dot1">.</span>
                                        <span className="dot" id="dot2">.</span>
                                        <span className="dot" id="dot3">.</span>
                                    </div>
                                </h3>
                            </div>
                        ) : msg && msg.length > 0 ? (
                            msg.map((message) => {
                                const own = message.authorId && message.authorId === myUserId
                                const author = message.author || 'Anonymous'
                                return (
                                    <li key={message._id} className={'msg-row' + (own ? ' msg-own' : '')}>
                                        <div className="msg-avatar" style={{ background: avatarColor(author) }}>
                                            {initials(author)}
                                        </div>
                                        <div className="msg-bubble">
                                            <div className="msg-meta">
                                                <span className="msg-author">{own ? 'You' : author}</span>
                                                {formatTime(message.createdAt) && (
                                                    <span className="msg-time">{formatTime(message.createdAt)}</span>
                                                )}
                                            </div>
                                            <div className="msg-text">{message.message}</div>
                                        </div>
                                    </li>
                                )
                            })
                        ) :
                            <div className="h-75 d-flex align-items-center justify-content-center">
                                <div style={{ width: "6rem", height: "6rem" }} className="spinner-border text-primary"></div>
                            </div>}
                        {newBelow && (
                            <button type="button" id="jumpLatest" onClick={scrollToLatest}>
                                ↓ New messages
                            </button>
                        )}
                    </ul>
                    <div id="chatFooter">
                        {socketReady && meTyping && (
                            <div className="typing-indicator">
                                <span className="typing-text">{typingName} is typing</span>
                                <div className="loading-dots">
                                    <span className="dot" id="dot1">.</span>
                                    <span className="dot" id="dot2">.</span>
                                    <span className="dot" id="dot3">.</span>
                                </div>
                            </div>
                        )}
                        {socketReady && userCount ? (
                            <form id="messageForm" action="" onSubmit={sendMessage} >
                                {errors && (
                                    <p style={{ color: "red", marginTop: "-46px" }}>{errors}</p>
                                )}
                                {showEmoji && (
                                    <div id="emojiPicker">
                                        {EMOJIS.map((emoji) => (
                                            <button key={emoji} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pickEmoji(emoji)}>{emoji}</button>
                                        ))}
                                    </div>
                                )}
                                <div id="composerRow">
                                    <button type="button" id="emojiBtn" onMouseDown={(e) => e.preventDefault()} onClick={toggleEmoji} disabled={!socketReady} aria-label="Add emoji">😊</button>
                                    <div id="composer">
                                        <input
                                            name="message"
                                            type="text"
                                            id="message"
                                            autoComplete="off"
                                            maxLength={MAX_MESSAGE_LENGTH}
                                            onChange={checkMessage}
                                            placeholder="Type a message… (/delete available)"
                                        ></input>
                                        <span id="charCount">{charCount}/{MAX_MESSAGE_LENGTH}</span>
                                    </div>
                                    <input ref={sendBtn} type="submit" id="sendBtn" value="Send" className="btn btn-primary" disabled />
                                </div>
                                <div className="spinner-grow" style={!submitted ? { display: "none" } : { width: '3rem', height: '3rem' }} role="status">
                                </div>
                            </form>
                        ) : ""}
                    </div>

                </div>
            )}


            {!connected && (
                <Login
                    getLogged={getLogged}
                />
            )}

        </div>
    );
};

export default Home;
