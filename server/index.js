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

/// persistent player data ///

const PLAYER_SPEED = 512  

const PLAYER_COLLIDER_SIZE = 64
const PLAYER_COLLIDER_OFFSET = 16

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


const ROLE_NONE = "none"
const ROLE_READY = "ready"
const ROLE_HIDE = "hide"
const ROLE_SEEK = "seek"
const ROLE_SPEC = "spectate"

const INPUT_LEFT    = 1
const INPUT_RIGHT   = 2
const INPUT_UP      = 4
const INPUT_DOWN    = 8

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

//////////////////////////////

/// level data ///////////////

const TILE_SIZE = 160

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
    serverMessage(`loaded level "${name}"`, "success")
}

//////////////////////////////

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
let gameSettings = new GameSettings()

let gameLoop = null

const TIMESTEP = 1000 / 60

function stepPhysics() {
    if (gameLoading) return
    for (let id in players) {
        if (playerExists(id)) {
            const { alive } = players[id]
            const input = playersInputs[id]
            const position = playersPositions[id]

            const dir = { x: 0, y: 0 }
            dir.x = (-(!!(input & INPUT_LEFT)) + +(!!(input & INPUT_RIGHT)))
            dir.y = (-(!!(input & INPUT_UP)) + +(!!(input & INPUT_DOWN)))

            if (+dir.x && +dir.y) {
                const dirLength = Math.sqrt(dir.x * dir.x + dir.y * dir.y)
                dir.x /= dirLength
                dir.y /= dirLength
            }

            const dX = dir.x * PLAYER_SPEED * TIMESTEP * .001
            const dY = dir.y * PLAYER_SPEED * TIMESTEP * .001

            // if a valid level was loaded
            if (alive && level) {
                // horizontal collision resolution
                if (Math.abs(dX) > 0)
                {
                    const collider = {
                        x: position.x + PLAYER_COLLIDER_OFFSET + dX,
                        y: position.y + PLAYER_COLLIDER_SIZE,
                        w: PLAYER_COLLIDER_SIZE,
                        h: PLAYER_COLLIDER_SIZE
                    }

                    const topLeft  = { x: ~~( collider.x                / TILE_SIZE), y: ~~( collider.y                / TILE_SIZE) }
                    const topRight = { x: ~~((collider.x + collider.w)  / TILE_SIZE), y: ~~( collider.y                / TILE_SIZE) }
                    const botLeft  = { x: ~~( collider.x                / TILE_SIZE), y: ~~((collider.y + collider.h) / TILE_SIZE) }
                    const botRight = { x: ~~((collider.x + collider.w)  / TILE_SIZE), y: ~~((collider.y + collider.h) / TILE_SIZE) }

                    const colliding = (
                        level.check(topLeft.x, topLeft.y) ||
                        level.check(topRight.x, topRight.y) || 
                        level.check(botLeft.x, botLeft.y) || 
                        level.check(botRight.x, botRight.y)
                    )

                    if (colliding) {
                        if (Math.sign(dX) === 1) position.x = topLeft.x * TILE_SIZE + collider.w + PLAYER_COLLIDER_OFFSET - 1
                        else position.x = topRight.x * TILE_SIZE - PLAYER_COLLIDER_OFFSET
                    } else position.x += dX
                }
                
                // vertical collision resolution
                if (Math.abs(dY) > 0)
                {
                    const collider = {
                        x: position.x + PLAYER_COLLIDER_OFFSET,
                        y: position.y + PLAYER_COLLIDER_SIZE + dY,
                        w: PLAYER_COLLIDER_SIZE,
                        h: PLAYER_COLLIDER_SIZE
                    }

                    const topLeft  = { x: ~~( collider.x                / TILE_SIZE), y: ~~( collider.y                / TILE_SIZE) }
                    const topRight = { x: ~~((collider.x + collider.w)  / TILE_SIZE), y: ~~( collider.y                / TILE_SIZE) }
                    const botLeft  = { x: ~~( collider.x                / TILE_SIZE), y: ~~((collider.y + collider.h) / TILE_SIZE) }
                    const botRight = { x: ~~((collider.x + collider.w)  / TILE_SIZE), y: ~~((collider.y + collider.h) / TILE_SIZE) }

                    const colliding = (
                        level.check(topLeft.x, topLeft.y) ||
                        level.check(topRight.x, topRight.y) || 
                        level.check(botLeft.x, botLeft.y) || 
                        level.check(botRight.x, botRight.y)
                    )

                    if (colliding) {
                        if (Math.sign(dY) === 1) position.y = topLeft.y * TILE_SIZE + PLAYER_COLLIDER_SIZE / 2 - 1
                        else position.y = botLeft.y * TILE_SIZE - PLAYER_COLLIDER_SIZE
                    } else position.y += dY
                }
            } else {
                position.x += dX
                position.y += dY
            }
        }
    }
    io.emit("updatePositions", playersPositions)
}

//////////////////////////////

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
        if (!Object.keys(players).length)
            gameLoop = setInterval(stepPhysics, TIMESTEP)

        const { name, x, y } = data

        players[socket.id] = new Player(name, ROLE_NONE)
        playersInputs[socket.id] = 0
        playersPositions[socket.id] = new Position(x, y)

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

    // load into the new game level
    loadLevel("lvl0.json")

    // randomly choose a player to be the "seek" role
    // everyone else becomes "hide" by default
    const socketIds = Object.keys(players)
    const randomId = socketIds[~~(Math.random() * socketIds.length)]

    for (let id in players) {
        if (id === randomId) players[id].role = ROLE_SEEK
        else players[id].role = ROLE_HIDE

        // move all players to starting location
        playersPositions[id].x = level.startX
        playersPositions[id].y = level.startY
    }

    io.sockets.emit('gameStarted')
    io.sockets.emit('updateLobby', players)

    serverMessage("game starting")
}

function endGame(won) {
    gameStarted = false
    level = null

    io.sockets.emit('gameEnded', { won })
    
    setTimeout(restartLobby, 10000)
    serverMessage("game has ended")
}

function restartLobby() {
    for (let id in players) {
        players[id].role = ROLE_NONE
        players[id].alive = true
    }

    io.sockets.emit('gameRestart')
    io.sockets.emit('updateLobby', players)

    serverMessage("lobby restarting")
}

function resetServer() {
    Object.keys(players).forEach((key) => delete players[key])
    Object.keys(playersInputs).forEach((key) => delete playersInputs[key])
    Object.keys(playersPositions).forEach((key) => delete playersPositions[key])

    level = null

    gameStarted = false
    gameLoading = false
    gameSettings = new GameSettings()

    if (gameLoading != null)
        clearInterval(gameLoop)

    serverMessage("resetting server", "error")
}

//////////////////////////////

/** open server to listen on port */
server.listen(PORT, () => {
    serverMessage("listening...", "success")
})
