import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Nav from '../components/Nav';
import axios from 'axios';
import config from '../config.json';

const APP_VERSION = process.env.REACT_APP_VERSION || '2.0.0';

const NEW_IN_V2 = [
    {
        icon: '⚡',
        title: 'Instant connection',
        text: 'The socket now starts the moment the page loads instead of waiting for a re-render. Sending is blocked behind a loader until the connection is ready — no more messages silently lost.',
    },
    {
        icon: '🏷️',
        title: 'Pseudo & timestamps',
        text: 'Every message now shows who sent it and when. Your own messages are highlighted on the right; messages sent before 2.0 appear as Anonymous.',
    },
    {
        icon: '⌨️',
        title: 'Typing indicator',
        text: 'See when someone is writing in real time, powered by the socket layer without any extra polling.',
    },
    {
        icon: '🔔',
        title: 'Unread badge',
        text: 'Receive a message while the tab is in the background? The page title shows an (N) counter until you look at it.',
    },
    {
        icon: '😀',
        title: 'Quick reactions',
        text: 'A built-in emoji picker next to the composer to react faster than you can type.',
    },
    {
        icon: '📐',
        title: 'Rebuilt layout',
        text: 'A real chat window: sticky composer, bubbles with avatars, status header and a smart scroll — open history without being yanked to the bottom, then jump back with one click.',
    },
    {
        icon: '📏',
        title: 'Input limits',
        text: 'Messages are capped (500 characters) with a live counter, validated on the client and on the server.',
    },
    {
        icon: '☁️',
        title: 'Cloud-native realtime',
        text: 'Socket messages now run on Cloudflare Workers with a Durable Object acting as the chat server, next to the static build — cold starts handled.',
    },
];

const TECH = [
    'React', 'Socket.IO', 'Node.js / Express', 'MongoDB',
    'Cloudflare Workers + Durable Objects', 'Render', 'SCSS / Bootstrap', 'Continuous deployment',
];

const ROADMAP = [
    { icon: '🖼️', text: 'Image sharing (upload + preview in the chat)' },
    { icon: '👥', text: 'Multiple rooms & private messages' },
    { icon: '🤝', text: 'Peer-to-peer file transfer over WebRTC (signaling is already on the server)' },
    { icon: '🔔', text: 'Native browser notifications' },
    { icon: '🌗', text: 'Light / dark theme toggle' },
];

const About = () => {
    const navigate = useNavigate()
    const [connected, setConnected] = useState(false);
    const [username, setUsername] = useState("")

    useEffect(() => {
        if (localStorage.getItem('JWT') && JSON.parse(localStorage.getItem('JWT')).expiry > new Date().getTime()) {
            setConnected(true)
            getUsername().then((username) => setUsername(username))
        }
    }, [])


    const getUsername = async () => {
        let username = "";
        await axios.get(config.api_url + '/api/secure/' + JSON.parse(localStorage.getItem('JWT')).userId).then((res) => {
            username = res.data.user.pseudo
        })
        return username
    }

    const brandLink = () => {
        navigate('/')
    }

    return (
        <div id="About">
            <Nav brandLink={brandLink} connected={connected} username={username}></Nav>

            <div className="about-wrap">

                <section className="about-hero">
                    <span className="about-badge">Version {APP_VERSION}</span>
                    <h1>
                        The chat is entering<br />
                        <span className="about-gradient">version {APP_VERSION}</span>
                    </h1>
                    <p className="about-lead">
                        Socket Chat started as a training project to learn real-time systems.
                        Version 1 proved the concept; version 2.0 makes it <strong>actually useful</strong>:
                        messages now carry their author and a timestamp, the connection starts instantly,
                        and the whole interface has been rebuilt around the conversation instead of a blinking list.
                    </p>
                    <p className="about-sub">
                        Everything below is live in production — served as a static build on Cloudflare,
                        with the realtime layer running on the same edge as the users.
                        You are currently running <strong>v{APP_VERSION}</strong>.
                    </p>
                    <Link to="/" className="about-cta">Open the chat →</Link>
                </section>

                <section className="about-section">
                    <h2>What's new in 2.0</h2>
                    <div className="about-grid">
                        {NEW_IN_V2.map((feature) => (
                            <article className="about-card" key={feature.title}>
                                <div className="about-card-icon">{feature.icon}</div>
                                <h3>{feature.title}</h3>
                                <p>{feature.text}</p>
                            </article>
                        ))}
                    </div>
                </section>

                <section className="about-section">
                    <h2>Architecture</h2>
                    <p className="about-text">
                        The React build is deployed on <strong>Cloudflare Workers + Durable Objects</strong>:
                        assets are served as static files, and a single Durable Object keeps the socket state
                        — avoiding the polling step entirely. The REST API (Node.js / Express + MongoDB)
                        runs on Render and is redeployed automatically on each push.
                    </p>
                    <div className="about-chips">
                        {TECH.map((tech) => (
                            <span className="about-chip" key={tech}>{tech}</span>
                        ))}
                    </div>
                </section>

                <section className="about-section">
                    <h2>Next up</h2>
                    <ul className="about-roadmap">
                        {ROADMAP.map((step) => (
                            <li key={step.text}>
                                <span className="about-roadmap-icon">{step.icon}</span>
                                {step.text}
                            </li>
                        ))}
                    </ul>
                </section>

                <footer className="about-footer">
                    <p>
                        This project remains a training playground — the goal is to learn real-time
                        systems, cloud hosting and continuous delivery, one version at a time.
                    </p>
                    <p className="about-footer-note">Socket Chat · v1 launched the chat · v2.0 made it a conversation.</p>
                </footer>

            </div>
        </div>
    );
};

export default About;
