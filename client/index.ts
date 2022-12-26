import {
    GAME_WIDTH,
    GAME_HEIGHT,
    TOTAL_GAME_TIME,
} from '../shared/constants'
import { ROLE_READY } from '../shared/enums'
import { lerp } from '../shared/utils'

import Camera from './Camera'
import EntityManager from './EntityManager'
import { Game, GameManager, GameState } from './Game'
import Level from './Level'
import { drawLights, drawLightsDebug, drawSpotlight } from './Lights'
import MouseManager from './Mouse'
import Renderer from './Renderer'
import SocketManager from './SocketManager'

window.onload = function () {
    const form = document.getElementById('user') as HTMLFormElement
    form.style.display = 'flex'
    form.style.alignItems = 'center'
    form.style.justifyContent = 'center'
    
    const input = document.getElementById('username') as HTMLInputElement
    
    const hueSlider = document.getElementById('hue') as HTMLInputElement
    hueSlider.value = Math.floor(Math.random() * 360).toString()
    const brightnessSlider = document.getElementById('brightness') as HTMLInputElement
    brightnessSlider.value = (Math.floor(Math.random() * 3) + 1).toString()
    const previewImage = document.getElementById('preview') as HTMLImageElement
    previewImage.style.filter = `hue-rotate(${hueSlider.value}deg) brightness(${brightnessSlider.value})`
    const setPreviewFilterStyle = () => previewImage.style.filter = `hue-rotate(${hueSlider.value}deg) brightness(${brightnessSlider.value})`
    hueSlider.oninput = brightnessSlider.oninput = setPreviewFilterStyle

    form.onsubmit = (e) => {
        if (input.value.length < 3 || input.value.length > 16) return

        e.preventDefault()
        form.remove()

        const canvas = document.createElement('canvas')
        const buffer = document.createElement('canvas')
        canvas.width  = buffer.width = GAME_WIDTH
        canvas.height = buffer.height = GAME_HEIGHT
        canvas.style.background = "black"
        canvas.style.width = "100%"
        canvas.style.maxHeight = "100%"
        document.body.appendChild(canvas)

        const ctx = canvas.getContext('2d')
        const bufferCtx = buffer.getContext('2d')
        const bufferGfx = new Renderer(bufferCtx)

        class Amogus extends Game {
            public start() {
                GameManager.instance.init(canvas)
                MouseManager.instance.init()

                SocketManager.instance.init(input.value, Number(hueSlider.value), Number(brightnessSlider.value))

                const level = new Level("maps/lobby.json")
                EntityManager.instance.setLevel(level)
            }
            
            protected update(dt: number) {
                EntityManager.instance.update(dt)

                const player = EntityManager.instance.player
                if (player) {
                    const { x: pX, y: pY } = player.center
                    Camera.instance.lookAt(pX, pY)
                }

                // update transition alpha
                GameManager.instance.transitionAlpha = lerp(
                    GameManager.instance.transitionAlpha,
                    GameManager.instance.state === GameState.LOADING || GameManager.instance.state === GameState.RESULTS ? 1 : 0,
                    0.03
                )
            }
            
            protected draw(gfx: Renderer) {
                gfx.clearScreen()
                bufferGfx.clearScreen()
                
                // draw game onto buffer canvas
                EntityManager.instance.level?.draw(bufferGfx, Camera.instance.xView, Camera.instance.yView)
                EntityManager.instance.draw(bufferGfx, Camera.instance.xView, Camera.instance.yView)
                
                // draw shadow mask to hide the map/other players
                const shouldRenderShadows = GameManager.instance.started && EntityManager.instance.player?.alive
                if (shouldRenderShadows) {
                    drawLights(gfx, Camera.instance.xView, Camera.instance.yView)
                    gfx.ctx.globalCompositeOperation = "source-in"
                }
                
                // render buffer canvas as image
                gfx.ctx.drawImage(buffer, 0, 0)
                
                if (shouldRenderShadows) {
                    gfx.ctx.globalCompositeOperation = "source-over"
                    drawSpotlight(gfx, Camera.instance.xView, Camera.instance.yView)
                }

                EntityManager.instance.player?.drawUI(gfx)

                if (GameManager.instance.started) {
                    const time = GameManager.instance.timeLeft
                    const mins = ~~(time / 60)
                    const secs = time - mins * 60
                    gfx.rectangle(
                        GAME_WIDTH / 2 - GAME_WIDTH / 8,
                        12,
                        GAME_WIDTH / 4,
                        40,
                        'gray'
                    )
                    gfx.rectangle(
                        GAME_WIDTH / 2 - GAME_WIDTH / 8 + 4,
                        16,
                        GAME_WIDTH / 4 - 8,
                        32,
                        'black'
                    )
                    gfx.rectangle(
                        GAME_WIDTH / 2 - GAME_WIDTH / 8 + 4,
                        16,
                        (GAME_WIDTH / 4 - 4) * GameManager.instance.timeLeft / TOTAL_GAME_TIME,
                        32,
                        `rgb(${lerp(255, 0, GameManager.instance.timeLeft / TOTAL_GAME_TIME)}, ${lerp(0, 255, GameManager.instance.timeLeft / TOTAL_GAME_TIME)}, 0)`
                    )
                    gfx.textOutline(
                        `${mins}:${secs < 10 ? '0' + secs : secs}`,
                        GAME_WIDTH / 2,
                        40,
                        'white',
                        'black',
                        'center',
                        24,
                        4
                    )
                }

                // render transition state
                gfx.ctx.save()
                gfx.ctx.fillStyle = `rgba(0, 0, 0, ${GameManager.instance.transitionAlpha})`
                gfx.ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
                gfx.ctx.restore()

                // game status text
                switch (GameManager.instance.state) {
                    // num players ready
                    case GameState.PREGAME: {
                        const ready = Object.values(EntityManager.instance.entities).filter((e) => e.role === ROLE_READY).length
                        const total = Object.keys(EntityManager.instance.entities).length
                        const playersText = `${ready} / ${total} players ready`
                        const { h: playersTextH } = gfx.measureText(playersText, 32)
                        gfx.textOutline(playersText, GAME_WIDTH / 2, GAME_HEIGHT - 16, ready === total ? "#00ff00" : ready > 0 ? "yellow" : "red", "black", "center", 32, 4)

                        const instructionText = `Press SPACE or E to READY`
                        gfx.textOutline(instructionText, GAME_WIDTH / 2, GAME_HEIGHT - 16 - playersTextH, "white", "black", "center", 24, 4)
                        break
                    }

                    // num players alive
                    case GameState.PLAYING: {
                        const alive = Object.values(EntityManager.instance.entities).filter((e) => e.alive).length
                        const total = Object.keys(EntityManager.instance.entities).length
                        const playersText = `${alive} / ${total} players alive`
                        gfx.textOutline(playersText, GAME_WIDTH / 2, GAME_HEIGHT - 16, alive === total ? "#00ff00" : alive > 2 ? "yellow" : "red", "black", "center", 32, 4)
                        break
                    }

                    case GameState.LOADING: {
                        if (EntityManager.instance.player && EntityManager.instance.player.role !== ROLE_READY && !GameManager.instance.winner) {
                            const roleText = `you are ${EntityManager.instance.player.role}`
                            gfx.text(roleText, GAME_WIDTH / 2, GAME_HEIGHT / 2, `rgba(255, 255, 255, ${GameManager.instance.transitionAlpha})`, "center", 48)
                        }
                        break
                    }

                    // winner
                    case GameState.RESULTS: {
                        const winText = `${GameManager.instance.winner} has won`
                        gfx.text(winText, GAME_WIDTH / 2, GAME_HEIGHT / 2, `rgba(255, 255, 255, ${GameManager.instance.transitionAlpha})`, "center", 48)
                        break
                    }
                }

                if (GameManager.instance.debug) this.drawDebug(gfx)
            }

            private drawDebug(gfx: Renderer) {
                // render shadow caster debug
                if (GameManager.instance.started && EntityManager.instance.player?.alive)
                    drawLightsDebug(gfx, Camera.instance.xView, Camera.instance.yView)

                EntityManager.instance.level?.drawDebug(gfx, Camera.instance.xView, Camera.instance.yView)
                EntityManager.instance.drawDebug(gfx, Camera.instance.xView, Camera.instance.yView)

                const player = EntityManager.instance.player
                if (!player) return

                // display player socket id
                const socketText = `socket id: ${player.socketId}`
                const { h: socketH } = gfx.measureText(socketText, 24)
                gfx.text(socketText, 8, socketH, "white", "left", 24)

                // display game state
                const gameText = `game state: ${GameManager.instance.state}`
                const { h: gameH } = gfx.measureText(gameText, 24)
                gfx.text(gameText, 8, socketH + gameH, "white", "left", 24)

                // display player role
                const roleText = `role: ${player.role}`
                const { h: roleH } = gfx.measureText(roleText, 24)
                gfx.text(roleText, 8, socketH + gameH + roleH, "white", "left", 24)
                
                // display player position
                const posText = `x: ${Math.round(player.x)}, y: ${Math.round(player.y)}`
                const { h: posH } = gfx.measureText(posText, 24)
                gfx.text(posText, 8, socketH + gameH + roleH + posH, "white", "left", 24)

                gfx.text(
                    `(${MouseManager.instance.worldX.toFixed(0)}, ${MouseManager.instance.worldY.toFixed(0)})`,
                    MouseManager.instance.x,
                    MouseManager.instance.y,
                    '#ffffffaa',
                    'center',
                    16
                )
            }
        }

        const game = new Amogus(ctx)
        game.start()
        game.run()
    }
}
