import React, { useRef, useState } from 'react';
import Nav from '../components/Nav';
import axios from "axios";
import { useNavigate, Link } from 'react-router-dom';
import config from '../config.json';


const Signup = () => {
    const password = useRef()
    const confirmPassword = useRef()
    const pseudo = useRef()
    const terms = useRef()
    const [errors, setErrors] = useState()
    const [uniqueErrors, setUniqueErrors] = useState()
    const [submitting, setSubmitting] = useState(false)
    const navigate = useNavigate()

    const newUser = (e) => {
        e.preventDefault()
        setSubmitting(true)
        setErrors()
        setUniqueErrors()
        const user = {
            pseudo: pseudo.current.value.trim(),
            password: password.current.value,
            confirmPass: confirmPassword.current.value,
            createdAt: new Date(),
            terms: terms.current.checked
        }
        axios.post(config.api_url + '/api/secure/signup', user)
            .then(() => {
                return axios.post(config.api_url + '/api/secure/login', {
                    pseudo: user.pseudo,
                    password: user.password
                })
            })
            .then(res => {
                const userConnected = {
                    token: res.data.token,
                    userId: res.data.userId,
                    expiry: new Date().getTime() + 86400000
                }
                localStorage.setItem('JWT', JSON.stringify(userConnected))
                // Keep the pseudo available before the first profile fetch.
                localStorage.setItem('socket-chat-username', res.data.pseudo || user.pseudo)
                navigate('/')
            })
            .catch(error => {
                setSubmitting(false)
                if (!error.response) {
                    setUniqueErrors('Unable to reach the server!')
                    return
                }
                if (error.response.status === 422) {
                    setErrors(error.response.data.errors)
                } else if (error.response.data && error.response.data.error) {
                    setUniqueErrors("Pseudo must be unique")
                } else if (error.response.data) {
                    setUniqueErrors(error.response.data.termsError)
                }
            })
    }

    return (
        <div id='signup'>
            <Nav />
            <div className="auth-screen">
                <div className="auth-card">
                    <div className="auth-head">
                        <div className="auth-logo" aria-hidden="true"></div>
                        <h1>Create your account</h1>
                        <p>Pick a pseudo and join the chat in seconds.</p>
                    </div>

                    <form className="auth-form" onSubmit={newUser}>
                        <label className="field" htmlFor="pseudo">
                            Username <span className="field-hint">(4 to 12 characters)</span>
                            <input ref={pseudo} type="text" name="pseudo" id="pseudo" className="input" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck="false" required />
                        </label>

                        <label className="field" htmlFor="password">
                            Password
                            <input ref={password} type="password" name="password" id="password" className="input" autoComplete="new-password" required />
                        </label>

                        <label className="field" htmlFor="confirmPassword">
                            Confirm password
                            <input ref={confirmPassword} type="password" name="confirmPassword" id="confirmPassword" className="input" autoComplete="new-password" required />
                        </label>

                        <label className="checkterms" htmlFor="acceptTerms">
                            <input ref={terms} type="checkbox" name="acceptTerms" id="acceptTerms" />
                            I accept the terms of use
                        </label>

                        {errors && errors[0] && <p className="form-error">{errors[0].msg}</p>}
                        {uniqueErrors && <p className="form-error">{uniqueErrors}</p>}

                        <button type="submit" className="btn-accent" disabled={submitting}>
                            {submitting && <span className="btn-spinner" aria-hidden="true"></span>}
                            {submitting ? 'Creating account…' : 'Create account'}
                        </button>
                    </form>

                    <p className="auth-alt">
                        Already have an account? <Link to="/">Log in</Link>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Signup;
