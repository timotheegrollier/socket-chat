const User = require('../models/tchatUser')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');

const normalizePseudo = (value) => typeof value === 'string' ? value.trim() : '';
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const findUserByPseudo = (pseudo) => {
    const clean = normalizePseudo(pseudo);
    if (!clean) return Promise.resolve(null);
    return User.findOne({ pseudo: new RegExp('^' + escapeRegex(clean) + '$', 'i') });
};

exports.signup = (req, res, next) => {
    const password = req.body.password
    const pseudo = normalizePseudo(req.body.pseudo)
    const terms = req.body.terms
    const confirmPass = req.body.confirmPass


    // VALIDATION

    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(422).json({ errors: errors.array() })
    }

    if (terms != true) {
        return res.status(423).json({ termsError:"Please accept terms of use !" })

    }else if(password != confirmPass){
        return res.status(423).json({ termsError: "Passwords don't match !" })

    }

    // ENCODAGE
    // Reject case variants (Timo/timo) even when the stored unique index is
    // still case-sensitive. The canonical display pseudo is preserved.
    findUserByPseudo(pseudo)
        .then((existing) => {
            if (existing) {
                return res.status(400).json({ error: 'Pseudo must be unique' });
            }
            return bcrypt.hash(password, 10)
                .then(hash => {
                    const user = new User({
                        pseudo,
                        password: hash,
                        createdAt: req.body.createdAt || new Date()
                    });
                    return user.save();
                })
                .then(() => res.status(201).json({ message: 'Utilisateur créé !' }));
        })
        .catch(error => res.status(400).json({ error }));
    

};

exports.login = (req, res, next) => {
    findUserByPseudo(req.body.pseudo)
        .then(user => {
            if (!user) {
                return res.status(401).json({ error: 'You have entered an invalid username or password' })
            }
            bcrypt.compare(req.body.password, user.password)
                .then(valid => {
                    if (!valid) {
                        return res.status(401).json({ error: 'You have entered an invalid username or password' })
                    }
                    res.status(200).json({
                        userId: user._id,
                        pseudo: user.pseudo,
                        token: jwt.sign({ userId: user._id }, 'RANDOM_TOKEN_SECRET', { expiresIn: '24h' })
                    })
                })
                .catch(error => res.status(500).json({ error }))
        })
        .catch(error => res.status(500).json({ error }))
}

exports.getAll = (req, res, next) => {
    User.find().then(users => res.status(200).json({ users })).catch(() => res.status(401))
}


exports.getUserName = (req,res,next)=>{
    User.findById(req.params.id)
    .then(user=>res.status(200).json({user}))
    .catch(error=>res.status(404).json({error}))
}

exports.deleteAll = (req,res,next)=>{
    User.collection.drop().then(res.status(200).json({ msg: "reset" }))
}