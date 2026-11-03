import React, { useEffect, useRef } from "react";
import Nav from '../components/Nav';
import socketIOClient from "socket.io-client";
import axios from "axios";
import { useStateIfMounted } from "use-state-if-mounted";
import Login from "../components/Login";
import { useNavigate } from "react-router-dom";


const Home = () => {
    const [msg, setMsg] = useStateIfMounted([])
    const [submitted, setSubmitted] = useStateIfMounted(false)
    const [errors, setErrors] = useStateIfMounted()
    const sendBtn = useRef()
    const [userCount, setUserCount] = useStateIfMounted()
    const socketRef = useRef()
    const [user, setUser] = useStateIfMounted()
    const [connected, setConnected] = useStateIfMounted(false)
    const [showedWarning, setShowedWarning] = useStateIfMounted(false)
    const navigate = useNavigate()
    const config = require('../config.json')
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    



    useEffect(() => {
        if (localStorage.getItem('JWT') && JSON.parse(localStorage.getItem('JWT')).expiry > new Date().getTime()) {
            getLogged(true)
            fetchMessages()

        } else {
            setConnected(false)
            localStorage.removeItem("JWT")
        }


        if (connected) {
            socketRef.current = socketIOClient(config.socket_url, {
                transports: ['websocket'],
            })
            socketRef.current.on("newMsg", () => {
                fetchMessages()
            })
            socketRef.current.on("reset", () => {
                fetchMessages()
            })

            socketRef.current.on('count', (count) => {
                setUserCount(count)
            })


            return () => socketRef.current.disconnect();
        }

        // eslint-disable-next-line 
    }, [connected]);



    const sendMessage = (e) => {
        e.preventDefault();
        let newMessage = {
            message: document.getElementById('message').value
        }
        setSubmitted(true)
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
        setSubmitted(false)
    }


    const showWarningHelper = (message) => {
        const helper = document.createElement('li')
        helper.classList.add('text-warning')
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

    const getLogged = async (connected) => {
        setConnected(connected)
        getUsername().then((username) => {
            setUser({
                userId: JSON.parse(localStorage.getItem('JWT')).userId,
                JWT: JSON.parse(localStorage.getItem('JWT')).token,
                username: username
            })
        })
    }

    const postMessage = (newMessage) => {
        axios.post(config.api_url + '/api/messages/new', newMessage)
            .then(() => {
                socketRef.current.emit("newMsg")
                document.getElementById('message').value = ""
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
        if (connected) {
            await axios.get(config.api_url + '/api/messages')
                .then(res => setMsg(res.data.messages))
                .catch(error => console.log(error))
            document.getElementById("tchat").scrollTop = document.getElementById("tchat").scrollHeight - document.getElementById("tchat").clientHeight
        }
    }

    if (errors) {
        setTimeout(() => {
            setErrors("")
        }, 1500)
    }

    const checkMessage = (e) => {
        let message = e.target.value;
        if (message === "") {
            sendBtn.current.setAttribute("disabled", "disabled")
        } else {
            sendBtn.current.removeAttribute("disabled")
        }
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
            socketRef.current.emit('resetTchat')
        })
    }

    return (
        <div id="Home">
            <Nav brandLink={brandLink} connected={connected} username={user && user.username} aboutLink={aboutLink}></Nav>
            {connected && (

                <ul id="tchat">
                    {msg && userCount ? (
                        msg.map((msg) => {
                            return <li key={msg._id}>{msg.message}</li>
                        })
                    ) :
                        <div className="h-75 d-flex align-items-center justify-content-center">
                            <div style={{ width: "6rem", height: "6rem" }} className="spinner-border text-primary"></div>
                        </div>}
                </ul>
            )}


            {connected && (
                userCount ?
                    <h3 className="text-center">Online:
                        {" " + userCount}
                    </h3>
                    :
                    <h3 className="text-center">Connexion au tchat en cours
                        <div className="loading-dots">
                            <div className="dot" id="dot1">.</div>
                            <div className="dot" id="dot2">.</div>
                            <div className="dot" id="dot3">.</div>
                        </div>
                    </h3>
            )}
            {connected && userCount ?
                <form id="messageForm" action="" onSubmit={sendMessage} >
                    {errors && (
                        <p style={{ color: "red", display: "flex", position: "absolute", top: "-50px" }}>{errors}</p>
                    )}
                    <input style={submitted ? { display: "none" } : { display: "block" }} autoFocus={!isMobile}  name="message" type="text" id="message" autoComplete="off" onChange={checkMessage} ></input>
                    <input ref={sendBtn} style={submitted ? { display: "none" } : { display: "block" }} id="sendBtn" type="submit" value="Send" className="btn btn-primary col-2" disabled />
                    <div className="spinner-grow" style={!submitted ? { display: "none" } : { width: '3rem', height: '3rem' }} role="status">
                    </div>
                </form>
                : ""}
            {!connected && (
                <Login
                    getLogged={getLogged}
                />
            )}

        </div>
    );
};

export default Home;
