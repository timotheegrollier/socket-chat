const io = require('socket.io-client');
const Message = require('../models/chatMessage')



exports.newMessage = (req, res, next) => {
    const message = typeof req.body.message === 'string' ? req.body.message.trim().slice(0, 500) : '';
    if (!message) {
        return res.status(400).json({ error: 'Message vide !' });
    }

    const author = typeof req.body.author === 'string' ? req.body.author.trim().slice(0, 12) : '';
    const authorId = typeof req.body.authorId === 'string' ? req.body.authorId.trim().slice(0, 64) : '';

    let newMessage = new Message({ message, author: author || 'Anonymous', authorId })
    newMessage.save()
        .then((msg) => res.status(200).json({ msg }))
        .catch((err) => res.status(400).json({ err }))
}

exports.getMessages = (req, res, next) => {
    Message.find()
        .then(messages => res.status(200).json({ messages }))
        .catch(error => res.status(400).json({ error }))
}

exports.deleteMessages = (req, res) => {
    Message.deleteMany()
    .then(()=>{
        res.status(200).json({ msg: "Tchat supprimé !" }); //http://localhost:3100
        const socketClient = io.connect('http://socket-tchat.tk');
         // For socket reset tchat //for heroku https://socket-tchat.herokuapp.com/
        socketClient.on('connect', () => {
            socketClient.emit('resetTchat');
            setTimeout(()=>{
                socketClient.disconnect()
            },200)
        });

    })
    .catch((error) => res.status(400).json({ error }))
}