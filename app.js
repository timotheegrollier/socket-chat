const express = require('express');

const mongoose = require('mongoose');
require('dotenv').config()

const path = require('path');
const tchatUser = require('./models/tchatUser');

const app = express()


const msgRoutes = require('./routes/messages')

const channelsRoutes = require('./routes/channels')

const usersRoutes = require('./routes/users')


const DBUSER = process.env.DBUSER



app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content, Accept, Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    next();
});


app.use(express.static(path.join(__dirname, './client/build/')))


app.use(express.json())



mongoose.connect("mongodb+srv://" + DBUSER + "@cluster0.zvv7c.mongodb.net/myFirstDatabase?retryWrites=true&w=majority",
    {
        useNewUrlParser: true,
        useUnifiedTopology: true
    })
    .then(() => console.log('Connexion à MongoDB réussie !'))
    .catch(() => console.log('Connexion à MongoDB échouée !'));

app.use('/api/messages', msgRoutes)

app.use('/api/channels', channelsRoutes)


app.use('/api/secure', usersRoutes)




app.get('*', function (req, res, next) {
    res.sendFile(path.join(__dirname, './client/build/index.html'), function (err) {
        if (err) {
            res.status(500).send(err)
        }
    })
})





module.exports = app;