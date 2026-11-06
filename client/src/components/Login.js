import axios from 'axios';
import React, { Component } from 'react';
import { Link } from 'react-router-dom';
import config from '../config.json';


export default class Login extends Component {
    constructor(props) {
        super(props);
        this.state = {
            loginError: "",
            submitting: false,
            showPassword: false,
        }
        this.login = this.login.bind(this)
        this.getLogged = this.props.getLogged
    }

    login(e) {
        e.preventDefault()
        const userCredentials = {
            pseudo: document.getElementById('pseudo').value,
            password: document.getElementById('password').value
        }
        this.setState({ submitting: true, loginError: "" })
        axios.post(config.api_url + '/api/secure/login', userCredentials).then((res) => {
            const pseudo = (res.data && res.data.pseudo) || userCredentials.pseudo
            this.storeUser(res.data.token, res.data.userId, pseudo).then(() => {
                this.setState({ submitting: false })
                this.getLogged(true)
            })
        }).catch(res => {
            this.setState({
                submitting: false,
                loginError: res.response ? res.response.data.error : 'Unable to reach the server!'
            })
        })
    }

    async storeUser(token, userId, pseudo) {
        const userConnected = {
            token: token,
            userId: userId,
            expiry: new Date().getTime() + 86400000
        }
        localStorage.setItem('JWT', JSON.stringify(userConnected))
        // Cache the pseudo so the chat can send messages immediately, even
        // before the profile request finishes (or if it fails).
        if (pseudo) localStorage.setItem('socket-chat-username', pseudo)
    }

    render() {
        const { loginError, submitting, showPassword } = this.state

        return (
            <div id="loginComponent">
                <div className="auth-card">
                    <div className="auth-head">
                        <div className="auth-logo" aria-hidden="true"></div>
                        <h1>Welcome back</h1>
                        <p>Log in to join the conversation.</p>
                    </div>

                    <form className="auth-form" onSubmit={this.login}>
                        <label className="field" htmlFor="pseudo">
                            Username
                            <input
                                id="pseudo"
                                type="text"
                                name="pseudo"
                                className="input"
                                autoComplete="username"
                                autoFocus
                                required
                            />
                        </label>

                        <label className="field" htmlFor="password">
                            Password
                            <div className="field-password">
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    name="password"
                                    className="input"
                                    autoComplete="current-password"
                                    required
                                />
                                <button
                                    type="button"
                                    className="field-eye"
                                    onClick={() => this.setState({ showPassword: !showPassword })}
                                >
                                    {showPassword ? 'Hide' : 'Show'}
                                </button>
                            </div>
                        </label>

                        {loginError && <p className="form-error">{loginError}</p>}

                        <button type="submit" className="btn-accent" disabled={submitting}>
                            {submitting && <span className="btn-spinner" aria-hidden="true"></span>}
                            {submitting ? 'Logging in…' : 'Log in'}
                        </button>
                    </form>

                    <p className="auth-alt">
                        No account yet? <Link to="/register">Create one</Link>
                    </p>
                </div>
            </div>
        )
    }
}
