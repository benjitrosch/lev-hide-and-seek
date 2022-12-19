const express = require('express')
const app = express()
const fs = require('fs')
const path = require('path')
const http = require('http')
const server = http.createServer(app)

const PORT = process.env.PORT || 8080

/** serve static content (aka build and public assets folder) */
app.use('/public', express.static(path.join(__dirname, '../public')))
app.use('/build', express.static(path.join(__dirname, '../build')))

/** serve the html */
app.get('/', (_, res) => {
    res.status(200).sendFile(path.join(__dirname, '../client/index.html'))
})

//////////////////////////////

const {
    ROLE_NONE,
    ROLE_READY,
    ROLE_HIDE,
    ROLE_SEEK,
    ROLE_SPEC,
} = require('../shared/enums')

const {
    TILE_SIZE,
    TOTAL_GAME_TIME,
} = require('../shared/constants')

const { stepPhysics } = require('../shared/physics')

/// player data //////////////

class Player {
    constructor(name, role) {
        this.name = name
        this.role = role
        this.alive = true
    }
}

class Position {
    constructor(x, y) {
        this.x = x
        this.y = y
    }
}

const players = {}
const playersInputs = {}
const playersPositions = {}

function playerExists(socketId) {
    return (
        socketId in players &&
        socketId in playersInputs &&
        socketId in playersPositions
    )
}

/// level data ///////////////

class Level {
    constructor(title, width, height, startX, startY, blocks) {
        this.title = title

        this.width = width
        this.height = height

        this.startX = startX
        this.startY = startY

        this.blocks = blocks.map((b) => !!b)
    }

    check(x, y) {
        const rows = ~~(this.width / TILE_SIZE)
        return this.blocks[x + y * rows]
    }
}

let level = null

function loadLevel(name) {
    const data = fs.readFileSync(path.join(__dirname, '../public/maps/' + name))
    const { title, width, height, startX, startY, blocks } = JSON.parse(data)

    level = new Level(title, width, height, startX, startY, blocks)

    // move all players to starting location
    for (let id in players) {
        playersPositions[id].x = level.startX
        playersPositions[id].y = level.startY
    }

    io.sockets.emit('updateLobby', players)

    serverMessage(`loaded level "${name}"`, "success")
}

/// server-side game logic ///

class GameSettings {
    constructor() {
        this.hideSpeed = 512
        this.seekSpeed = 480

        this.killCooldown = 45
        this.seekDelay = 10
    }
}

let gameStarted = false
let gameLoading = false
let gameTime = TOTAL_GAME_TIME
let gameSettings = new GameSettings()

let gameLoopInterval = null
let gameTimeInterval = null

const TIMESTEP = 1000 / 60

function gameLoop() {
    if (gameLoading) return
    for (let id in players) {
        if (playerExists(id)) {
            const { x, y } = stepPhysics(
                players[id],
                playersPositions[id].x,
                playersPositions[id].y,
                playersInputs[id],
                level,
                TIMESTEP * 0.001
            )
            playersPositions[id].x = x
            playersPositions[id].y = y
        }
    }
    io.emit("updatePositions", playersPositions)
}

/// debug ////////////////////

function serverMessage(message, type = "") {
    let color = ""
    switch (type) {
        case "error":
            color = "\u001b[1;31m"
            break

        case "success":
            color = "\u001b[1;32m"
            break

        case "warn":
            color = "\u001b[1;33m"
            break

        default:
            color = "\x1b[0m"
            break
    }
    console.log(color + `[*:${PORT}] ${message}`)
}

/// socket.io ////////////////

const { Server } = require("socket.io")
const io = new Server(server)

io.on('connection', (socket) => {
    serverMessage(`user "${socket.id}" has connected`)

    /** new user joins the lobby, added to server players */
    socket.on('join', (data) => {
        // if this is the first player to join,
        // start the server-side game loop
        if (!Object.keys(players).length) {
            loadLevel("lobby.json")
            gameLoopInterval = setInterval(gameLoop, TIMESTEP)
        }

        const { name } = data

        players[socket.id] = new Player(name, ROLE_NONE)
        playersInputs[socket.id] = 0
        if (level) playersPositions[socket.id] = new Position(level.startX, level.startY)
        else playersPositions[socket.id] = new Position(0, 0)

        // if the game has already started, change the
        // new player into a spectator
        if (gameStarted) {
            players[socket.id].role = ROLE_SPEC
            players[socket.id].alive = false
        }
        socket.emit('returnPlayer', { ...players[socket.id], socketId: socket.id })

        // send updated lobby to all connected users
        io.sockets.emit('updateLobby', players)

        serverMessage(`player "${name}" has joined the lobby`, "success")
    })

    /** user leaves lobby, deleted from server players */
    socket.on('disconnect', () => {
        if (playerExists(socket.id)) {
            delete players[socket.id]
            delete playersInputs[socket.id]
            delete playersPositions[socket.id]

            // send updated lobby to all connected users
            io.sockets.emit('updateLobby', players)

            serverMessage(`player "${socket.id}" has disconnected`, "warn")
        } else {
            serverMessage(`user "${socket.id}" disconnected without entering the lobby`, "error")
        }

        // if no more players left
        if (!Object.keys(players).length)
            resetServer()
    })

    socket.on('input', (input) => {
        if (playerExists(socket.id)) {
            playersInputs[socket.id] = input
            socket.broadcast.emit('updateInputs', playersInputs)
        }
    })

    /** user changes role to "ready" (or un-ready) during pregame lobby */
    socket.on('ready', (data) => {
        const { socketId, ready } = data

        if (playerExists(socketId)) {
            players[socketId].role = ready ? ROLE_READY : ROLE_NONE
            io.sockets.emit('updateLobby', players)
        }

        // start the game if we have at least 2 players
        // and they're all in the "ready" state
        const playerValues = Object.values(players)
        if (playerValues.length > 1 && playerValues.every((p) => p.role === ROLE_READY)) {
            gameLoading = true
            io.sockets.emit('starting')
            setTimeout(startGame, 3000)
        }
    })

    /** player has been killed and changes to spectator */
    socket.on('kill', (data) => {
        const { socketId } = data

        if (playerExists(socketId)) {
            players[socketId].alive = false
            players[socketId].role = ROLE_SPEC

            io.sockets.emit('updateLobby', players)

            serverMessage(`user "${socketId}" has been killed!!`)
        }

        if (!Object.values(players).filter((p) => p.role === ROLE_HIDE).length)
            endGame(false)
    })
})

/** start the game */
function startGame() {
    gameLoading = false
    gameStarted = true
    gameTime = TOTAL_GAME_TIME

    // start game timer
    gameTimeInterval = setInterval(() => {
        gameTime = Math.max(0, gameTime - 1)
        if (gameTime <= 0)
            endGame(true)

        io.sockets.emit('updateTime', { time: gameTime })
    }, 1000)

    // load into the new game level
    loadLevel("game.json")

    // randomly choose a player to be the "seek" role
    // everyone else becomes "hide" by default
    const socketIds = Object.keys(players)
    const randomId = socketIds[~~(Math.random() * socketIds.length)]

    for (let id in players) {
        if (id === randomId) players[id].role = ROLE_SEEK
        else players[id].role = ROLE_HIDE
    }

    io.sockets.emit('gameStarted')
    io.sockets.emit('updateLobby', players)

    serverMessage("game starting")
}

function endGame(won) {
    gameLoading = true
    gameStarted = false

    clearInterval(gameTimeInterval)

    io.sockets.emit('gameEnded', { won })
    
    setTimeout(restartLobby, 8000)
    serverMessage("game has ended")
}

function restartLobby() {
    gameLoading = false

    for (let id in players) {
        players[id].role = ROLE_NONE
        players[id].alive = true
    }

    loadLevel("lobby.json")

    io.sockets.emit('gameRestart')
    io.sockets.emit('updateLobby', players)

    serverMessage("lobby restarting")
}

function resetServer() {
    Object.keys(players).forEach((key) => delete players[key])
    Object.keys(playersInputs).forEach((key) => delete playersInputs[key])
    Object.keys(playersPositions).forEach((key) => delete playersPositions[key])

    loadLevel("lobby.json")

    gameStarted = false
    gameLoading = false
    gameSettings = new GameSettings()

    clearInterval(gameLoopInterval)
    clearInterval(gameTimeInterval)

    serverMessage("resetting server", "error")
}

//////////////////////////////

server.listen(PORT, () => {
    serverMessage("listening...", "success")
})
