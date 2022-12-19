import io, { Socket } from "socket.io-client"

import { MAX_DISTANCE_RECONCILIATION } from '../shared/constants'
import { ROLE_SPEC } from '../shared/enums'
import { dist, lerp } from '../shared/utils'

import EntityManager from "./EntityManager"
import { GameManager, GameState } from "./Game"
import Level from "./Level"
import Player from "./Player"

export default class SocketManager {
    private static _instance: SocketManager
    public static get instance() {
        return this._instance || (this._instance = new this())
    }

    public socket: Socket

    public get socketId() {
        return this.socket.id
    }

    public init(name: string) {
        this.socket = io()

        // connect to lobby
        this.socket.on('connect', () => {
            // add self to entity manager and
            // emit 'join' socket event
            this.socket.emit('join', { name })
        })

        this.socket.on('returnPlayer', (player) => {
            const { name, role, socketId, alive } = player
            EntityManager.instance.addEntity(
                socketId,
                new Player(name, role, socketId, true, alive)
            )

            // if the returned player has a spectator role,
            // we can assume the game has already started
            if (role === ROLE_SPEC) {
                GameManager.instance.state = GameState.PLAYING

                const level = new Level("maps/game.json")
                EntityManager.instance.setLevel(level)
            }
        })

        // get latest players in lobby
        this.socket.on('updateLobby', (players) => {
            const updatedPlayers: { [socketId: string]: boolean } = {}

            for (let id in players) {
                const { name, role, alive } = players[id]

                // add new players to entity manager
                if (!(id in EntityManager.instance.entities) && id !== this.socketId) {
                    EntityManager.instance.addEntity(
                        id,
                        new Player(name, role, id, false, alive)
                    )
                } else if (id in EntityManager.instance.entities) {
                    EntityManager.instance.entities[id].username = name
                    EntityManager.instance.entities[id].role = role

                    if (EntityManager.instance.entities[id].alive && !alive)
                        EntityManager.instance.entities[id].kill()
                    
                    EntityManager.instance.entities[id].alive = alive
                }

                updatedPlayers[id] = true
            }

            // remove disconnected players
            for (let id in EntityManager.instance.entities) {
                if (!(id in updatedPlayers))
                    EntityManager.instance.removeEntity(id)
            }
        })

        // get player inputs from server to
        // simulate smooth client side movement
        this.socket.on('updateInputs', (inputs) => {
            for (let id in inputs) {
                if (id in EntityManager.instance.entities) {
                    EntityManager.instance.entities[id].keys = inputs[id]
                }
            }
        })

        // get position calculated from server to
        // keep players synced and server authoritative
        this.socket.on('updatePositions', (positions) => {
            for (let id in positions) {
                if (id in EntityManager.instance.entities) {
                    const player = EntityManager.instance.entities[id]
                    const { x: oldX, y: oldY } = player
                    const { x: newX, y: newY } = positions[id]

                    // if distance between client side pos and
                    // server side calculated pos is larger than
                    // acceptable threshold, just jump
                    const distance = dist({ x: newX, y: newY }, { x: oldX, y: oldY })
                    if (distance > MAX_DISTANCE_RECONCILIATION) {
                        player.x = newX
                        player.y = newY
                    } else {
                        // lerp towards the correct position (so we don't stutter/jump)
                        player.x = lerp(oldX, newX, 0.2)
                        player.y = lerp(oldY, newY, 0.2)
                    }
                }
            }
        })

        this.socket.on('starting', () => {
            GameManager.instance.state = GameState.LOADING
        })

        this.socket.on('gameStarted', () => {
            setTimeout(() => {
                GameManager.instance.state = GameState.PLAYING
                EntityManager.instance.player?.setCooldownInterval()
            }, 3000)

            const level = new Level("maps/game.json")
            EntityManager.instance.setLevel(level)
        })

        this.socket.on('gameEnded', (data) => {
            const { won } = data

            EntityManager.instance.player?.clearCooldownInterval()

            GameManager.instance.state = GameState.RESULTS
            GameManager.instance.winner = won ? "hide" : "seek"
        })

        this.socket.on('gameRestart', () => {
            const level = new Level("maps/lobby.json")
            EntityManager.instance.setLevel(level)

            GameManager.instance.state = GameState.LOADING
            setTimeout(() => {
                GameManager.instance.state = GameState.PREGAME
                GameManager.instance.winner = null
            }, 1000)
        })

        this.socket.on('updateTime', (data) => {
            const { time } = data
            GameManager.instance.timeLeft = time
        })
    }
}
