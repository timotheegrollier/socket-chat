import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import config from '../config.json';

const MIN_PSEUDO_LENGTH = 4;
const MAX_PSEUDO_LENGTH = 12;
const MIN_PASSWORD_LENGTH = 4;
const MAX_PASSWORD_LENGTH = 20;

const readApiError = (error, fallback) => {
    const data = error && error.response && error.response.data;
    if (data) {
        if (Array.isArray(data.errors) && data.errors.length && data.errors[0].msg) {
            return data.errors[0].msg;
        }
        if (typeof data.error === 'string' && data.error) return data.error;
        if (typeof data.termsError === 'string' && data.termsError) return data.termsError;
    }
    return fallback;
};

const AccountDialog = ({ open, pseudo, token, onClose, onProfileUpdated, onSessionExpired }) => {
    const [profileName, setProfileName] = useState(pseudo || '');
    const [profileError, setProfileError] = useState('');
    const [profileSuccess, setProfileSuccess] = useState('');
    const [savingProfile, setSavingProfile] = useState(false);

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPasswords, setShowPasswords] = useState(false);
    const [passwordError, setPasswordError] = useState('');
    const [passwordSuccess, setPasswordSuccess] = useState('');
    const [savingPassword, setSavingPassword] = useState(false);

    const overlayRef = useRef(null);
    const pseudoInputRef = useRef(null);

    // Re-seed the form every time the dialog opens so a cancelled edit never
    // leaks into the next visit.
    useEffect(() => {
        if (!open) return undefined;
        setProfileName(pseudo || '');
        setProfileError('');
        setProfileSuccess('');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setShowPasswords(false);
        setPasswordError('');
        setPasswordSuccess('');
        setSavingProfile(false);
        setSavingPassword(false);

        const focusTimer = setTimeout(() => {
            if (pseudoInputRef.current) pseudoInputRef.current.focus();
        }, 30);
        return () => clearTimeout(focusTimer);
    }, [open, pseudo]);

    useEffect(() => {
        if (!open) return undefined;

        const onKeyDown = (event) => {
            if (event.key === 'Escape') onClose();
        };
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', onKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open, onClose]);

    if (!open) return null;

    const isSessionExpired = (error) => {
        if (error && error.response && error.response.status === 401) {
            onSessionExpired();
            return true;
        }
        return false;
    };

    const submitProfile = async (event) => {
        event.preventDefault();
        const name = profileName.trim();
        if (name.length < MIN_PSEUDO_LENGTH || name.length > MAX_PSEUDO_LENGTH) {
            setProfileError(`Username must be between ${MIN_PSEUDO_LENGTH} and ${MAX_PSEUDO_LENGTH} characters.`);
            return;
        }

        setSavingProfile(true);
        setProfileError('');
        setProfileSuccess('');
        try {
            const response = await axios.put(
                config.api_url + '/api/secure/account',
                { pseudo: name },
                { headers: { Authorization: 'Bearer ' + token } }
            );
            const user = response.data && response.data.user;
            const updatedName = user && user.pseudo ? user.pseudo : name;
            setProfileName(updatedName);
            setProfileSuccess('Username updated.');
            if (onProfileUpdated) onProfileUpdated(updatedName);
        } catch (error) {
            if (!isSessionExpired(error)) {
                setProfileError(readApiError(error, 'Could not update your username.'));
            }
        } finally {
            setSavingProfile(false);
        }
    };

    const submitPassword = async (event) => {
        event.preventDefault();
        if (!currentPassword) {
            setPasswordError('Enter your current password.');
            return;
        }
        if (newPassword.length < MIN_PASSWORD_LENGTH || newPassword.length > MAX_PASSWORD_LENGTH) {
            setPasswordError(`New password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters.`);
            return;
        }
        if (newPassword !== confirmPassword) {
            setPasswordError("New passwords don't match.");
            return;
        }

        setSavingPassword(true);
        setPasswordError('');
        setPasswordSuccess('');
        try {
            await axios.put(
                config.api_url + '/api/secure/password',
                {
                    currentPassword,
                    password: newPassword,
                    confirmPass: confirmPassword,
                },
                { headers: { Authorization: 'Bearer ' + token } }
            );
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setShowPasswords(false);
            setPasswordSuccess('Password updated. Use it the next time you log in.');
        } catch (error) {
            if (!isSessionExpired(error)) {
                setPasswordError(readApiError(error, 'Could not update your password.'));
            }
        } finally {
            setSavingPassword(false);
        }
    };

    const closeFromBackdrop = (event) => {
        if (event.target === overlayRef.current) onClose();
    };

    return (
        <div
            className="account-overlay"
            ref={overlayRef}
            onMouseDown={closeFromBackdrop}
            role="presentation"
        >
            <div
                className="account-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="account-dialog-title"
            >
                <header className="account-head">
                    <div>
                        <h2 id="account-dialog-title">Account settings</h2>
                        <p>Update how you appear and keep your account secure.</p>
                    </div>
                    <button
                        type="button"
                        className="account-close"
                        aria-label="Close account settings"
                        title="Close"
                        onClick={onClose}
                    >
                        ×
                    </button>
                </header>

                <div className="account-body">
                    <section className="account-section" aria-labelledby="account-profile-title">
                        <h3 id="account-profile-title">Profile</h3>
                        <p className="account-hint">
                            This is the name other people see on your messages.
                            Usernames are unique, regardless of case.
                        </p>

                        <form className="account-form" onSubmit={submitProfile}>
                            <label className="field" htmlFor="account-pseudo">
                                Username
                                <input
                                    id="account-pseudo"
                                    ref={pseudoInputRef}
                                    type="text"
                                    className="input"
                                    name="pseudo"
                                    autoComplete="username"
                                    autoCapitalize="none"
                                    autoCorrect="off"
                                    spellCheck="false"
                                    maxLength={MAX_PSEUDO_LENGTH}
                                    value={profileName}
                                    onChange={(event) => setProfileName(event.target.value)}
                                    required
                                />
                            </label>
                            <span className="account-meta">
                                <span>{MIN_PSEUDO_LENGTH}–{MAX_PSEUDO_LENGTH} characters</span>
                                <span>{profileName.trim().length}/{MAX_PSEUDO_LENGTH}</span>
                            </span>

                            {profileError && <p className="form-error" role="alert">{profileError}</p>}
                            {profileSuccess && <p className="form-success" role="status">{profileSuccess}</p>}

                            <button type="submit" className="btn-accent" disabled={savingProfile}>
                                {savingProfile && <span className="btn-spinner" aria-hidden="true"></span>}
                                {savingProfile ? 'Saving…' : 'Save username'}
                            </button>
                        </form>
                    </section>

                    <section className="account-section" aria-labelledby="account-password-title">
                        <h3 id="account-password-title">Password</h3>
                        <p className="account-hint">
                            Confirm your current password before choosing a new one.
                            You will stay signed in on this device.
                        </p>

                        <form className="account-form" onSubmit={submitPassword}>
                            <label className="field" htmlFor="account-current-password">
                                Current password
                                <input
                                    id="account-current-password"
                                    type={showPasswords ? 'text' : 'password'}
                                    className="input"
                                    name="current-password"
                                    autoComplete="current-password"
                                    value={currentPassword}
                                    onChange={(event) => setCurrentPassword(event.target.value)}
                                    required
                                />
                            </label>

                            <label className="field" htmlFor="account-new-password">
                                New password
                                <input
                                    id="account-new-password"
                                    type={showPasswords ? 'text' : 'password'}
                                    className="input"
                                    name="new-password"
                                    autoComplete="new-password"
                                    minLength={MIN_PASSWORD_LENGTH}
                                    maxLength={MAX_PASSWORD_LENGTH}
                                    value={newPassword}
                                    onChange={(event) => setNewPassword(event.target.value)}
                                    required
                                />
                            </label>

                            <label className="field" htmlFor="account-confirm-password">
                                Confirm new password
                                <input
                                    id="account-confirm-password"
                                    type={showPasswords ? 'text' : 'password'}
                                    className="input"
                                    name="confirm-password"
                                    autoComplete="new-password"
                                    minLength={MIN_PASSWORD_LENGTH}
                                    maxLength={MAX_PASSWORD_LENGTH}
                                    value={confirmPassword}
                                    onChange={(event) => setConfirmPassword(event.target.value)}
                                    required
                                />
                            </label>

                            <button
                                type="button"
                                className="account-reveal"
                                onClick={() => setShowPasswords(!showPasswords)}
                            >
                                {showPasswords ? 'Hide passwords' : 'Show passwords'}
                            </button>

                            {passwordError && <p className="form-error" role="alert">{passwordError}</p>}
                            {passwordSuccess && <p className="form-success" role="status">{passwordSuccess}</p>}

                            <button type="submit" className="btn-accent" disabled={savingPassword}>
                                {savingPassword && <span className="btn-spinner" aria-hidden="true"></span>}
                                {savingPassword ? 'Updating…' : 'Update password'}
                            </button>
                        </form>
                    </section>
                </div>
            </div>
        </div>
    );
};

export default AccountDialog;
