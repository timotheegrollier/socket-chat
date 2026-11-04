import React, { Component } from 'react';
import { Link, NavLink } from 'react-router-dom';

class Nav extends Component {
    handleLogout(e) {
        e.preventDefault()
        localStorage.removeItem("JWT")
        window.location.reload()
    }

    render() {
        const { username, connected } = this.props
        const initials = (username || '?').trim().charAt(0).toUpperCase()

        return (
            <header className="app-nav">
                <div className="nav-inner">
                    <Link to="/" className="nav-brand">
                        <span className="nav-logo" aria-hidden="true"></span>
                        <span className="nav-title">Socket Chat</span>
                    </Link>

                    <nav className="nav-links">
                        <NavLink
                            to="/"
                            end
                            className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
                        >
                            Chat
                        </NavLink>
                        <NavLink
                            to="/about"
                            className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
                        >
                            About
                        </NavLink>
                    </nav>

                    <div className="nav-user">
                        {connected ? (
                            <>
                                <span className="nav-avatar" aria-hidden="true">{initials}</span>
                                <span className="nav-username">{username || '…'}</span>
                                <button type="button" className="nav-logout" onClick={this.handleLogout}>
                                    Log out
                                </button>
                            </>
                        ) : (
                            <Link to="/register" className="nav-cta">Sign up</Link>
                        )}
                    </div>
                </div>
            </header>
        )
    }
}

export default Nav;
